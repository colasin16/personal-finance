import { IdValueObject } from '../value-object/id-value-object';

export abstract class DomainError extends Error {
  constructor(
    private readonly code: number = 500,
    messageText?: string,
    private aggregateId?: IdValueObject
  ) {
    super();
    this.message = messageText || this.getFallbackErrorMessage();
  }

  public addAggregateId(aggregateId: IdValueObject): DomainError {
    this.aggregateId = aggregateId;
    return this;
  }

  public getErrorCode(): number {
    return this.code;
  }
  protected getFallbackErrorMessage(): string {
    const errorId = (this as unknown as new (...args: any[]) => any).constructor
      .name;

    return `${errorId} ${this.aggregateId ? 'at aggregate: ' + this.aggregateId : ''}`;
  }
}
