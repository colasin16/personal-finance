'use client';

import { useState } from 'react';

import { api } from '@src/trpc/react';
import { Typography } from '@mui/material';

export function LatestMovements() {
  const [latestMovements] = api.movement.getLatest.useSuspenseQuery();

  return latestMovements ? (
    latestMovements.map((movement) => (
      <Typography>
        {movement.description}:
        <Typography
          variant="subtitle1"
          color={movement.amount >= 0 ? 'green' : 'red'}
        >
          {movement.amount}
        </Typography>
      </Typography>
    ))
  ) : (
    <Typography> You have no movements yet. </Typography>
  );
}
