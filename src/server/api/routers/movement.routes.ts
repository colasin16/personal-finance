import { createTRPCRouter, publicProcedure } from '@src/server/api/trpc';
import { readFileSync } from 'fs';
import path from 'path';
import { read } from 'xlsx';

export const movementRouter = createTRPCRouter({
  getLatest: publicProcedure.query(async ({ ctx }) => {
    console.log('🚀 ~ .query ~ Read file here');

    try {
      const buf = readFileSync(
        path.join(
          process.cwd(),
          'src',
          'assets',
          'data',
          'movements-1782024.xls'
        )
      );

      const workbook = read(buf);
      const rows = workbook.Sheets.Movimientos;

      if (!rows) return [];

      // console.log('🚀 ~ getLatest:publicProcedure.query ~ rows:', rows);
      // console.log(
      //   '🚀 ~ getLatest:publicProcedure.query ~ Object.keys(rows):',
      //   Object.keys(rows)
      // );
      const registry = new Map();

      Object.entries(rows).forEach(([cell, value]) => {
        const column = cell.slice(0, 1);
        const rowNum = cell.slice(1);

        if (column === '!' || !rowNum || (rowNum && Number(rowNum) < 7)) {
          return;
        }

        if (column === 'D') {
          const storedValue = registry.get(rowNum.toString());
          console.log(
            '🚀 ~ Object.entries ~ Storing DESCRIPTION for key:',
            rowNum.toString()
          );
          registry.set(rowNum.toString(), {
            ...storedValue,
            description: value.w,
          });
        }

        if (column === 'G') {
          const storedValue = registry.get(rowNum.toString());
          console.log(
            '🚀 ~ Object.entries ~ Storing AMOUNT for key:',
            rowNum.toString()
          );
          registry.set(rowNum.toString(), {
            ...storedValue,
            amount: Number(value.w),
          });
        }
      });

      const result: { description: string; amount: number }[] = [];
      registry.forEach((value) => {
        console.log('🚀 ~ getLatest:publicProcedure.query ~ value:', value);
        result.push(value);
      });

      return result.filter(
        (value) => !isNaN(value.amount) && value.amount !== undefined
      );
    } catch (error) {
      console.log('🚀 ~ getLatest:publicProcedure.query ~ error:', error);
    }

    return [];
  }),
});
