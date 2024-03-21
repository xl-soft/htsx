// deno-lint-ignore-file no-explicit-any
import * as path from "https://deno.land/std@0.207.0/path/mod.ts";
import { walk } from "https://deno.land/std@0.216.0/fs/mod.ts";
import { minify as cssm } from "https://cdn.jsdelivr.net/npm/csso";
import {DOMParser} from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import * as base64 from "https://deno.land/std@0.207.0/encoding/base64.ts";
import { Router } from "https://deno.land/x/oak@v13.0.0/router.ts";
import { Context, Application } from "https://deno.land/x/oak@v13.0.0/mod.ts";
import { minifyHTML } from "https://deno.land/x/minify@1.0.1/mod.ts";

export interface HTSXProps<T = any> { 
    [key: string]: any
    payload?: T
}

interface HTSXOptions {
    root: any
    server: {
        app: Application
        router: Router,
        init: () => void
    },
    props?: HTSXRenderProps
}

export type HTSXView = (props: HTSXProps) => Promise<string>

export type HTSXApi = (ctx: Context, props: HTSXProps) => Promise<string>

interface HTSXEndpointHandlers {
    view?: HTSXView | null,
    head?: string | null,
    js?: string | null,
    css?: string | null,
    get?: HTSXApi | null,
    post?: HTSXApi | null,
}

type HTSXEndpointTypes = 'view' | 'api'

interface HTSXEndpoint {
    path: string,
    type: HTSXEndpointTypes
    handlers: HTSXEndpointHandlers
}

interface HTSXRenderProps { 
    [key: string]: any
    root?: {
        [key: string]: any
    }
    payload?: (ctx: Context) => any
}

const HTSXViewFileNames = {
    page_server: '+view.ts',
    page_client_js: '+view.js',
    page_client_css: '+view.css',
}

const HTSXApiFileNames = {
    endpoint_get: '+get.ts',
    endpoint_post: '+post.ts',
}

const HTSXRootFileNames = {
    root: '+root.ts',
}

const HTSXEndpointFileNames = {...HTSXViewFileNames, ...HTSXApiFileNames}


export default class HTSX {

    constructor(private options: HTSXOptions) {
        options.root = path.resolve(this.options.root)
        this.routes = path.join(this.options.root,'routes')
        this.initialized = this.init()
    }

    private routes: string = ''
    private initialized: Promise<void>;
    private endpoints: HTSXEndpoint[] = []

    private async init() {
        await this.struct()
    }

    private async struct() {
        const routes_path = path.join(this.options.root, 'routes')
        for await (const entry of walk(routes_path)) {
            if ( entry.isFile === false && Object.values(HTSXEndpointFileNames).includes(entry.name) === false) continue
            const endpoint_path = `/` + entry.path.split(this.options.root)
                .join('').split('/routes')
                .join('').split(entry.name)
                .join('').split('/')
                .filter(value => value !== '' && value !== null && value !== undefined)
                .join('/')

            const existing_endpoint_test = this.endpoints.findIndex(value => value.path === endpoint_path)
            const absolute_path = path.resolve(entry.path)
            if (existing_endpoint_test === -1) {
                this.endpoints.push({
                    path: endpoint_path,
                    //@ts-ignore <>
                    type: `${Object.values(HTSXViewFileNames).includes(entry.name) === true ? 'view' : ''}${Object.values(HTSXApiFileNames).includes(entry.name) === true ? 'api' : ''}`,
                    handlers: {
                        head: null,
                        view: null,
                        js: null,
                        css: null,

                        get: null,
                        post: null,
                    }
                })
            }
            const existing_endpoint = this.endpoints.findIndex(value => value.path === endpoint_path)
            if (entry.name === HTSXViewFileNames.page_server) this.endpoints[existing_endpoint].handlers.view = (await import(absolute_path)).default
            if (entry.name === HTSXViewFileNames.page_server) this.endpoints[existing_endpoint].handlers.head = (await import(absolute_path)).HEAD
            if (entry.name === HTSXViewFileNames.page_client_js) this.endpoints[existing_endpoint].handlers.js = await Deno.readTextFile(absolute_path)
            if (entry.name === HTSXViewFileNames.page_client_css) this.endpoints[existing_endpoint].handlers.css = await Deno.readTextFile(absolute_path)

            if (entry.name === HTSXApiFileNames.endpoint_get) this.endpoints[existing_endpoint].handlers.get = (await import(absolute_path)).default
            if (entry.name === HTSXApiFileNames.endpoint_post) this.endpoints[existing_endpoint].handlers.post = (await import(absolute_path)).default
        }
        this.serve()
    }

    private clean(html: string) {

        const html_clean = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

        const document_dirty = new DOMParser().parseFromString(html, "text/html");
        const document = new DOMParser().parseFromString(html_clean, "text/html");

        const style_nodes = document_dirty?.getElementsByTagName('style')
        const style_array: string[] = [];
        style_nodes?.forEach((node) => style_array.push(node.innerHTML))
        const style_string = (cssm(style_array.join(''), { restructure: true })).css
        const style_base64 = base64.encodeBase64(style_string).toString()
        const style_node = document?.createElement('link')
        style_node?.setAttribute('rel', 'stylesheet')
        style_node?.setAttribute('type', 'text/css')
        style_node?.setAttribute('href', `data:text/css;base64,${style_base64}`)
        document?.head.appendChild(style_node!)
        return `<!DOCTYPE html>\n${document?.documentElement?.outerHTML}`
    }

    private async root(props?: HTSXProps) {
        let root_path = ''
        for await (const entry of Deno.readDir(this.options.root)) {
            if (entry.isFile === false && Object.values(HTSXRootFileNames).includes(entry.name) === false) continue
            root_path = path.join(this.options.root, entry.name)
        }
        const root_import = await import(root_path)
        return await root_import.default(props)
    }

    private async handle_view(path: string, props?: HTSXRenderProps) {
        await this.initialized;
        const router = this.options.server.router
        router.get(path, async (ctx) => {
            let status = 200
            const endpoint = this.endpoints.find(endpoint => endpoint.path === path && endpoint.type === 'view')!
            if (endpoint === undefined) status = 404
            const rendered = await this.root({ body: await endpoint.handlers.view!({...props, ...this.options.props?.payload !== undefined ? { payload: await this.options.props?.payload(ctx) } : {} }),...props?.root, })
            const document = new DOMParser().parseFromString(rendered, "text/html")!;
            if (endpoint.handlers.js !== null) {
                const script = document.createElement("script")!
                script.innerHTML = endpoint.handlers.js!
                document?.head.appendChild(script)
            }
            if (endpoint.handlers.css !== null) {
                const style = document.createElement("style")!
                style.innerHTML = endpoint.handlers.css!
                document?.head.appendChild(style)
            }
            if (endpoint.handlers.head !== null) {
                const container = document.createElement('div');
                container.innerHTML = endpoint.handlers.head!.trim();
                container.childNodes.forEach((node) => {
                    document.head.appendChild(node)
                })
                
            }

            const filled_html = document?.documentElement?.outerHTML!
            const cleared_html = this.clean(filled_html)
            const minified_html = minifyHTML(cleared_html, {
                minifyJS: true,
                minifyCSS: true
            })


            ctx.response.status = status
            ctx.response.headers.set("Content-Type", "text/html")
            ctx.response.body = minified_html
        })
    }

    private async handle_api(path: string, props?: HTSXRenderProps) {
        await this.initialized;
        let status = 200
        
        const endpoint = this.endpoints.find(endpoint => endpoint.path === path && endpoint.type === 'api')!
        if (endpoint === undefined) status = 404
        const router = this.options.server.router
        
        if (endpoint.handlers.get !== null) 
        router.get(endpoint.path, async (ctx) => {
            const server_props = {...props, ...this.options.props?.payload !== undefined ? { payload: await this.options.props?.payload(ctx) } : {} }
            ctx.response.status = status
            ctx.response.headers.set("Content-Type", "application/json")
            ctx.response.body = JSON.stringify(await endpoint.handlers.get!(ctx, server_props!))
        })

        if (endpoint.handlers.post !== null) 
        router.post(endpoint.path, async (ctx) => {
            const server_props = {...props, ...this.options.props?.payload !== undefined ? { payload: await this.options.props?.payload(ctx) } : {} }
            ctx.response.status = status
            ctx.response.headers.set("Content-Type", "application/json")
            ctx.response.body = JSON.stringify(await endpoint.handlers.post!(ctx, server_props!))
        })
    }

    private async serve() {
        await this.initialized;

        this.endpoints.forEach((endpoint) => {
            if (endpoint.type === "api") this.handle_api(endpoint.path, this.options.props)
            if (endpoint.type === "view") this.handle_view(endpoint.path, this.options.props)
        })
        this.options.server.app.use(this.options.server.router.routes());
        this.options.server.app.use(this.options.server.router.allowedMethods());
        this.options.server.init()
    }
}