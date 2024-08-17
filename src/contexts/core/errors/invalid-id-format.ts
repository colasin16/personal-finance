import { DomainError } from './domain-error';

export class InvalidIdFormat extends DomainError {
  constructor(id: string) {
    super(500, `Invalid id format: ${id}`);
  }
}
