export class QueryModel {
  public sourceId?: number;
  public metadata: { [key: string]: string } = {};

  protected constructor(public content: string) {}

  static fromString(query: string, baseQuery?: QueryModel): QueryModel {
    const model = new QueryModel(query.trim());

    if (baseQuery) {
      model.sourceId = baseQuery.sourceId;
      model.metadata = baseQuery.metadata;
    }

    return model;
  }
}
