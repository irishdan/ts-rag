class PromptTemplate {
  generateQueryExpansionTemplate(question: string, expandToN: number, separator: string): string {
    return `
You are an AI language model assistant. Your task is to generate ${expandToN}
different versions of the given user question to retrieve relevant documents from a vector
database. By generating multiple perspectives on the user question, your goal is to help
the user overcome some of the limitations of the distance-based similarity search.
Provide these alternative questions seperated by '${separator}'.
Original question: ${question}
    `;
  }

  generateSelfQueryTemplate(question: string): string {
    return `
You are an AI language model assistant. Your task is to extract information from a user question.
The required information that needs to be extracted is a specific source passage id number that the
user explicitly references (e.g., "passage 42" or "source id 7").
Your response should consist of only the extracted id number, nothing else.
If the user question does not reference a specific passage id, you should return the following token: none.

For example:
QUESTION 1:
What does passage 42 say about Uruguay?
RESPONSE 1:
42

QUESTION 2:
Tell me something about Abraham Lincoln.
RESPONSE 2:
none

User question: ${question}
    `;
  }
}

export default new PromptTemplate();
