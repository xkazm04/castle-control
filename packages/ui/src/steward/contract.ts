import { stewardAsk, stewardWritSeal, stewardWritTear } from '@castle-control/contract/steward';
import { parseJson } from '@castle-control/contract/door';

// Infer the generated types from the public validators without the full RPC registry.
type SchemaValue<V> = V extends (value: unknown) => value is infer T ? T : never;
export type AskParams = SchemaValue<typeof stewardAsk.params>;
export type Writ = SchemaValue<typeof stewardAsk.result>['writ'];
export type WritChamber = Writ['chamber'];
export type WritSealParams = SchemaValue<typeof stewardWritSeal.params>;
export type WritTearParams = SchemaValue<typeof stewardWritTear.params>;

function checked<T>(validator: (value: unknown) => value is T, text: string): T {
  const value = parseJson(text);
  if (!validator(value)) throw new Error('Invalid Steward contract value');
  return value;
}

export const parseStewardAskParams = (text: string) => checked(stewardAsk.params, text);
export const parseStewardAskResult = (text: string) => checked(stewardAsk.result, text);
export const parseWritSealParams = (text: string) => checked(stewardWritSeal.params, text);
export const parseWritSealResult = (text: string) => checked(stewardWritSeal.result, text);
export const parseWritTearParams = (text: string) => checked(stewardWritTear.params, text);
export const parseWritTearResult = (text: string) => checked(stewardWritTear.result, text);
