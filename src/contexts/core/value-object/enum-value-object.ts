import { ValueNotInEnum } from '../errors/value-not-in-enum';

export class EnumValueObject<Enum> {
  constructor(
    enumerate: { [t: number]: string },
    private readonly value: Enum | string
  ) {
    this.validate(enumerate, value);
  }

  protected validate(
    enumerate: { [t: number]: string },
    value: Enum | string
  ): void {
    const stringValue = value as unknown as string;
    if (!Object.values(enumerate).includes(stringValue)) {
      throw new ValueNotInEnum(stringValue, enumerate);
    }
  }

  public toPrimitives(): string {
    return this.value as unknown as string;
  }

  public equals(other: EnumValueObject<Enum> | Enum): boolean {
    if (other instanceof EnumValueObject) {
      return this.value === other.value;
    }
    return other === this.value;
  }
}
