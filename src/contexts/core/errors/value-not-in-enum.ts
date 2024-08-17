import { DomainError } from './domain-error';

export class ValueNotInEnum extends DomainError {
  constructor(value: string, enumerate: any) {
    super(
      500,
      `${Object.keys(enumerate).join(',')} enum does not include value: ${value}`
    );
  }
}
