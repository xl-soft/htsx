<br/>
<br/>
<div align="middle">
    <img src="https://i.imgur.com/X0ou5EY.png" height=120>
</div>

#

<h3 align="center">
    <strong>HTSX</strong> - Hyper Text (on) Server eXtended
</h3>
<br/>
<p align="right">
    <img src="https://i.imgur.com/XfArZkI.png" />
    <img src="https://i.imgur.com/h8cehu5.png" />
</p>

> **HTSX** - Minimal Deno SSR framework on vanilla HTML

<h2 id="install"><strong>🔗 Useful Links</strong></h2>

* <a href="#install">Installation</a>
* <a href="#start">Quickstart</a>
* <a href="#usecase">Use case</a>
* <a href="#license">License</a>

<h2 id="install"><strong>💾 Installation</strong></h2>

```ts
import { HTSX } from 'https://deno.land/x/htsx/mod.ts'
import { Application } from 'https://deno.land/x/oak/mod.ts'
import { Router } from 'https://deno.land/x/oak/router.ts'
```

<h2 id="docs"><strong>📄 Quickstart</strong></h2>

#### HTSX - basically, template engine with extra functions, like:

- Automatic handler for HTTP requests
- Filesystem-based routing
- Minifier on endpoints
- Pure HTML components
- REST API constructor

#### To start, replicate this filesystem

```
Root
│   main.ts      (main file)
│
└───web
    │   +root.ts      (<App/> like component)
    │
    ├───components
    │       Button.ts      (pure HTML component)
    │
    └───routes
        │   +view.ts      (server component)
        │   +view.js      (client component)
        │   +view.css     (client css)
        │
        └───api
            └───v1/user
                    +get.ts      (GET handler)
                    +post.ts     (POST handler)
```
For starters, let's create basic Oak server and pass app and router in `HTSX` class

`main.ts`
``` ts
import { HTSX } from 'https://deno.land/x/htsx/mod.ts'
import { Application } from 'https://deno.land/x/oak/mod.ts'
import { Router } from 'https://deno.land/x/oak/router.ts'

const app = new Application()
const router = new Router()

await new HTSX({ 
    root: './web', 
    server: { app, router, () => { app.listen({ port: 8080 })} },
    props: {
        payload: async (_ctx: Context) => {
            return { name: 'John' };
        }
    }
})
```

Then you need to create `+root.ts` file on root folder that you provide to `HTSX` class

It's like `</App>` component in React

`web/+root.ts`
```ts
import { HTSXProps } from "https://deno.land/x/htsx/mod.ts";

export default (props: HTSXProps) => { return /*html*/`
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body>
        ${props.body} <!-- required -->
    </body>
    </html>
`}
```

Basic config is over, now you can create endpoints for your server in `routes` folder, for example - view endpoint on `/` and `Button` component

`web/components/Button.ts`
```ts
import { HTSXProps } from "https://deno.land/x/htsx/mod.ts";

export default (props: HTSXProps) => { return /*html*/`
    <button onclick="${props.onclick}">
        ${props.name}
    </button>

    <style>
        button {
            background: violet
        }
    </style>
`}
```

`web/routes/+view.ts`
```ts
import Button from "../components/Button.ts";
import { HTSXProps } from "https://deno.land/x/htsx/mod.ts";

// In view components you can export HEAD if you want to specify title, preload something or put script from CDN exclusively on this endpoint
export const HEAD = /*html*/`
    <title>Hello World</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,300..900;1,300..900&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/@tma.js/sdk@1.3.0"></script>
    <style>
        * {
            font-family: "Rubik", sans-serif;
            font-optical-sizing: auto;
            font-weight: 400;
            font-style: normal;
        }
    </style>
`
export default (props: HTSXProps) => { return /*html*/`
    <main>
        <h1>hello, ${props.payload.name}! press da button!</h1>
        ${Button({ name: 'PRESS ME!!!!', onclick: `click_handler()` })}
    </main>
`}
```

`web/routes/+view.js`
```js
// This is vanilla browser JS
function click_handler() {
    alert('Hello World!')
}
```

`web/routes/+view.css`
```css
h1 {
    color: red
}
```

<img src="https://i.imgur.com/OFYmSle.png">

#### Now let's create REST API endpoint

Create `+get.ts` or `+post.ts` in any directory inside routest directory, for example

`/web/routes/api/v1/user/users.ts`
```ts
export const users = [
    { id: 1, name: 'John Doe', age: 28 },
    { id: 2, name: 'Foo Bar', age: 99 },
    { id: 3, name: 'I love Deno', age: 21 },
    { id: 4, name: 'I love Bun', age: 1 }
]
```

`/web/routes/api/v1/user/+get.ts`
```ts
import { Context } from "https://deno.land/x/oak@v13.0.0/mod.ts";
import { HTSXProps } from "https://deno.land/x/htsx/mod.ts";
import { users } from './users.ts'

export default (ctx: Context, props: HTSXProps) => {
    const id = Number(ctx.request.url.searchParams.get('id'))
    const user = users.find(user => user.id === id)

    if (user === undefined)
        return { error: `no user with ${id} id` }; 
    else
        return user
}
```

`/web/routes/api/v1/user/+post.ts`
```ts
import { Context } from "https://deno.land/x/oak@v13.0.0/mod.ts";
import { HTSXProps } from "https://deno.land/x/htsx/mod.ts";

export default (ctx: Context, props: HTSXProps) => {
    return { id: 1, name: 'John Doe', age: 28, }
}
```
<img src="https://i.imgur.com/FJ8Vmic.png">
<img src="https://i.imgur.com/CqGG3ro.png">
<img src="https://i.imgur.com/tv4R3dj.png">
<img src="https://i.imgur.com/MzxrCI6.png">

#### So here is example how to quickly create basic API and HTML site with cool DX

Since it's pure HTML, you can safely plug in any library from React to HTMX

<h2 id="usecase"><strong>🤔 Use case</strong></h2>

This "framework" was created for convenient work with Telegram mini applications, for the lack of need to use something like Fresh for a basic one-page interface the idea to create this library was born.

Your use case may be different, but it will still be a handy tool for achieving simple goals

<h2 id="license"><strong>📜 License</strong></h2>

[MIT](https://github.com/xl-soft/htsx/blob/master/LICENSE)

<br/>
<div align="center">
  <a href="https://t.me/xlsoftware" target="_blank" rel="noreferrer">
    <img src="https://i.imgur.com/xxZkZfo.png" width=300>
  </a>
</div>
