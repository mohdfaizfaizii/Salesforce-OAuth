import { createStartHandler } from '@tanstack/react-start/server';
import { getRouter } from '../src/router';

export const config = {
  runtime: 'edge',
};

const handler = createStartHandler(getRouter);

export default async function (request) {
  return handler(request);
}
