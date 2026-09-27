import { QueryModel } from "./queryModel";

export class EmbeddedQueryModel extends QueryModel {
  public embedding: number[] = [];

  static fromQueryModel(embedding: number[], queryModel: QueryModel): EmbeddedQueryModel {
    const model = new EmbeddedQueryModel(queryModel.content);

    model.sourceId = queryModel.sourceId;
    model.metadata = queryModel.metadata;
    model.embedding = embedding;

    return model;
  }
}
