import { createStartHandler } from '@tanstack/react-start/server'
import { createRouter } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen'

const router = createRouter({ routeTree })

export default createStartHandler({
  createRouter,
  getRouterManifest: async () => {
    return import('./routeTree.gen').then((m) => m.routeTree)
  },
})
