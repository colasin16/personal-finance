
export type PrimitiveOf<T extends { toPrimitives(): any }> = ReturnType<T["toPrimitives"]>;
