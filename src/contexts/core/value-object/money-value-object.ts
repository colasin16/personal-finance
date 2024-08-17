import { EUR } from '@dinero.js/currencies';
import {
  Currency,
  Dinero,
  DineroSnapshot,
  add,
  dinero,
  equal,
  subtract,
  toSnapshot,
} from 'dinero.js';

export class MoneyValueObject {
  readonly value: Dinero<number>;

  constructor(
    amount: number,
    currency: Currency<number> = EUR,
    scale?: number
  ) {
    this.value = dinero({ amount, currency, scale });
  }

  static fromSnapshot(snapshot: DineroSnapshot<number>) {
    return new MoneyValueObject(
      snapshot.amount,
      snapshot.currency,
      snapshot.scale
    );
  }

  public add(amount: MoneyValueObject) {
    const result = add(this.value, amount.value);
    return MoneyValueObject.fromSnapshot(toSnapshot(result));
  }

  public subtract(amount: MoneyValueObject): MoneyValueObject {
    const result = subtract(this.value, amount.value);
    return MoneyValueObject.fromSnapshot(toSnapshot(result));
  }

  public equals(other: MoneyValueObject): boolean {
    return equal(this.value, other.value);
  }

  public toSnapshot() {
    return toSnapshot(this.value);
  }

  public toString(): string {
    return this.value.toString();
  }
}
