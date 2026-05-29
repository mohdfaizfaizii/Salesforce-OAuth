import { createStartHandler } from '@tanstack/react-start/server'
import { createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'

import { routeTree } from '../src/routeTree.gen'

const queryClient = new QueryClient()

const router = createRouter({ 
  routeTree,
  context: { queryClient },
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
})

export default createStartHandler({
  createRouter,
  getRouterManifest: async () => {
    return import('../src/routeTree.gen').then((m) => m.routeTree)
  },
})
