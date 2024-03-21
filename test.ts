import { HTSX } from './mod.ts'
import { Application, Context } from 'https://deno.land/x/oak@v13.0.0/mod.ts'
import { Router } from 'https://deno.land/x/oak@v13.0.0/router.ts'

const app = new Application()
const router = new Router()

await new HTSX({ 
    root: './web', 
    server: { app, router, init: () => { app.listen({ port: 8080 })} },
    props: {
        payload: () => {
            return { user: "John" }
        }
    }
})