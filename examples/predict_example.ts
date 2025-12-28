import { Signature, Predict, configure, LM } from "../src/index";
import { openai } from "@ai-sdk/openai";

configure({
  lm: new LM(openai("gpt-4o")),
});

const predict = new Predict("question -> answer");
const response = await predict.run({
  question: "What is the capital of France?",
});
console.log(response.answer);
