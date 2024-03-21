import { HTSX } from './mod.ts'
import { Application } from 'https://deno.land/x/oak@v13.0.0/mod.ts'
import { Router } from 'https://deno.land/x/oak@v13.0.0/router.ts'

const app = new Application()
const router = new Router()

await new HTSX({ 
    root: './web', 
    server: { app, router, init: () => { app.listen({ port: 8080 }); console.log('Server listening on 8080') } },
    logger: (ctx) => { 
        console.log(`New ${ctx.request.method} request! ${ctx.request.url} ${ctx.response.status === 200 ? `` : `, error: ${ctx.response.status}`}`) 
    },
    props: {
        payload: async (ctx) => {
            return { user: "John" }
        }
    }
})

