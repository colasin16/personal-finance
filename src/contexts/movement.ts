import { IdValueObject } from './core/value-object/id-value-object';
import { MoneyValueObject } from './core/value-object/money-value-object';
import { MovementType } from './movement-type';

export class Movement {
  constructor(
    private id: IdValueObject,
    private amount: MoneyValueObject,
    private type: MovementType
  ) {}
}
