import { runPrototype } from "../workflow.js";

const request = "Organise a university networking event for 50 attendees within RM1,500.";
const result = await runPrototype(request);
console.log(JSON.stringify(result, null, 2));
