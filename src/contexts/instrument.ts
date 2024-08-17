import { EnumValueObject } from '../../ddd/domain/EnumValueObject';
import { InstrumentValues } from './instrument-values';

export class Instrument extends EnumValueObject<InstrumentValues> {
  public static guitar = new Instrument(InstrumentValues.GUITAR);
  public static drums = new Instrument(InstrumentValues.DRUMS);
  public static bass = new Instrument(InstrumentValues.BASS);
  public static piano = new Instrument(InstrumentValues.PIANO);

  constructor(value: InstrumentValues | string) {
    super(InstrumentValues, value);
  }
}
