import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { OperationsStore, hash } from './store.js';
import type { EventApplicationService } from '../core/event-application-service.js';

export class DocumentService {
  constructor(private store: OperationsStore,private events: EventApplicationService,private directory: string) {}
  async proposal(owner: string,eventId: string) {
    this.store.authorize(owner,eventId);
    const result = await this.events.getSummary(eventId);
    if (!result.ok) throw new Error('Event missing');
    const { event,tasks,facts } = result.value, request = event.workflow.request;
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica),bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595,842]),y = 780;
    // Built-in fonts have limited glyph coverage: fail explicitly rather than silently dropping event text.
    const paragraph = (text: string,heading = false) => {
      if(heading && y<110) { page=pdf.addPage([595,842]); y=780; }
      const font = heading ? bold : regular,size = heading ? 15 : 10;
      font.encodeText(text);
      const words = text.split(/\s+/); let line = '';
      const draw = () => {
        if (y<65) { page = pdf.addPage([595,842]); y=780; }
        page.drawText(line,{x:48,y,size,font,color:heading ? rgb(.1,.25,.36) : rgb(.15,.18,.22)}); y-=heading ? 24 : 15;
      };
      for(const word of words) {
        if(font.widthOfTextAtSize(word,size)>495) {
          if(line) { draw(); line=''; }
          for(const character of word) { if(font.widthOfTextAtSize(line+character,size)>495) {draw();line='';} line+=character; }
          draw(); line=''; continue;
        }
        if(line && font.widthOfTextAtSize(`${line} ${word}`,size)>495) {draw();line='';}
        line += (line ? ' ' : '')+word;
      }
      if(line) draw(); y-=7;
    };
    paragraph('DARLINGAGENT | EVENT PROPOSAL',true);
    paragraph(request.title,true); paragraph('DRAFT - planning document; not a booking or institutional approval.');
    paragraph('Event details',true);
    for(const [label,value] of Object.entries({Date:request.date,Time:request.startTime && `${request.startTime} - ${request.endTime ?? 'TBC'}`,Timezone:request.timezone,Location:request.location,Venue:request.venue,Organizer:request.organizer,Attendance:request.attendeeCount})) paragraph(`${label}: ${value ?? 'Not confirmed'}`);
    if(request.description) paragraph(request.description);
    paragraph('Itemized budget',true);
    for(const line of event.workflow.budget) paragraph(`${line.item}: ${request.currency ?? 'MYR'} ${line.amount.toFixed(2)} [${line.status}] - ${line.note}`);
    paragraph(`Total: ${request.currency} ${event.workflow.total.toFixed(2)} | Remaining: ${event.workflow.remainingBudget?.toFixed(2) ?? 'Not verified'}`);
    paragraph('Organizer checklist',true);
    if(!tasks.length) paragraph('No organizer tasks recorded.');
    for(const task of tasks) paragraph(`${task.title} [${task.status}]${task.dependencies.length ? ` - depends on ${task.dependencies.join(', ')}` : ''}`);
    if(facts.length) paragraph('Facts and evidence',true);
    for(const fact of facts) paragraph(`${fact.field}: ${fact.value} [${fact.status}]. Source: ${fact.evidence}`);
    paragraph('Assumptions and outstanding work',true);
    for(const item of [...event.workflow.assumptions,...result.value.unresolvedIssues]) paragraph(item);
    const pages = pdf.getPages();
    pages.forEach((p,index) => p.drawText(`DarlingAgent | Event ${eventId} | Revision ${event.revision} | ${index+1} / ${pages.length}`,{x:48,y:30,size:8,font:regular}));
    const bytes = await pdf.save();
    const verified = await PDFDocument.load(bytes);
    if(!verified.getPageCount()) throw new Error('PDF verification failed');
    const id=randomUUID(); await mkdir(this.directory,{recursive:true,mode:0o700});
    const path=join(this.directory,`${id}.pdf`); await writeFile(path,bytes,{mode:0o600,flag:'wx'});
    const digest=hash(await readFile(path));
    this.store.db.prepare('INSERT INTO op_documents VALUES(?,?,?,?,?,?,?,?,?)').run(id,owner,eventId,path,digest,bytes.length,pages.length,event.revision,new Date().toISOString());
    this.store.audit(owner,'document.generated',id,{sha256:digest,pages:pages.length});
    return {id,sha256:digest,bytes:bytes.length,pages:pages.length,eventRevision:event.revision};
  }
  async read(owner: string,id: string) {
    const row = this.store.db.prepare('SELECT * FROM op_documents WHERE id=? AND owner=?').get(id,owner) as {path:string;sha256:string;event_id:string}|undefined;
    if(!row) throw new Error('Document access denied');
    this.store.authorize(owner,row.event_id);
    const path=resolve(row.path),root=resolve(this.directory)+sep;
    if(!path.startsWith(root)) throw new Error('Invalid document path');
    const bytes=await readFile(path); if(hash(bytes)!==row.sha256) throw new Error('Document integrity check failed');
    return bytes;
  }
}
