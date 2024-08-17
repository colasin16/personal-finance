import { EnumValueObject } from './core/value-object/enum-value-object';
import { MovementValues } from './movement-type-values';

export class MovementType extends EnumValueObject<MovementValues> {
  public static expense = new MovementType(MovementValues.EXPENSE);
  public static income = new MovementType(MovementValues.INCOME);

  constructor(value: MovementValues | string) {
    super(MovementValues, value);
  }
}
