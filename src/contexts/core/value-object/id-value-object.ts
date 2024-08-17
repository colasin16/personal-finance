import { ObjectId } from 'bson';
import { InvalidIdFormat } from '../errors/invalid-id-format';

export class IdValueObject {
  public readonly value: ObjectId;

  constructor(value: string) {
    if (!ObjectId.isValid(value)) {
      throw new InvalidIdFormat(value);
    }
    this.value = new ObjectId(value);
  }

  public static new(): IdValueObject {
    return new IdValueObject(new ObjectId().toHexString());
  }

  public toString(): string {
    return this.value.toHexString();
  }

  public equals(other: IdValueObject): boolean {
    return other.value.equals(this.value);
  }
}
