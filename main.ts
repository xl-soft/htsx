// deno-lint-ignore-file no-explicit-any
import * as path from "https://deno.land/std@0.216.0/path/mod.ts";
import { walk, exists } from "https://deno.land/std@0.216.0/fs/mod.ts";

import { minify as cssm } from "https://cdn.jsdelivr.net/npm/csso";
import { minifyHTML as htmlm } from "https://deno.land/x/minify@1.0.1/mod.ts";

import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import { Router } from "https://deno.land/x/oak@v13.0.0/router.ts";
import { Context, Application } from "https://deno.land/x/oak@v13.0.0/mod.ts";
import { base64 } from "https://deno.land/x/oak_commons@0.5.0/deps.ts";

interface HTSXOptions {
    root: any
    server: {
        app: Application
        router: Router,
        init: () => void
    },
    logger?: (ctx: Context) => void,
    props?: HTSXRenderProps
}

export interface HTSXProps<T = any> { 
    [key: string]: any
    ctx?: Context
    payload?: T
}

interface HTSXRenderProps { 
    [key: string]: any
    root?: {
        [key: string]: any
    }
    ctx?: Context
    payload?: (ctx: Context) => any
}

type HTSXEndpointTypes = 'view' | 'api'
export type HTSXView = (props: HTSXProps) => Promise<string>
export type HTSXApi = (ctx: Context, props: HTSXProps) => Promise<string>
interface HTSXEndpoint {
    path: string,
    type: HTSXEndpointTypes
    handlers: HTSXEndpointHandlers
}
interface HTSXEndpointHandlers {
    view?: HTSXView | null,
    view_head?: string | null,
    js?: string | null,
    css?: string | null,

    get: HTSXApi | null,
    head: HTSXApi | null,
    patch: HTSXApi | null,
    options: HTSXApi | null,
    delete: HTSXApi | null,
    post: HTSXApi | null,
    put: HTSXApi | null,
}

const HTSXViewFileNames = {
    page_server: '+view.ts',
    page_client_js: '+view.js',
    page_client_css: '+view.css',
}
const HTSXApiFileNames = {
    endpoint_get: '+api.get.ts',
    endpoint_head: '+api.head.ts',
    endpoint_patch: '+api.patch.ts',
    endpoint_options: '+api.options.ts',
    endpoint_delete: '+api.delete.ts',
    endpoint_post: '+api.post.ts',
    endpoint_put: '+api.put.ts',
}
const HTSXRootFileNames = {
    root: '+root.ts',
    root_css: '+root.css',
    error: '+error.ts',
    error_css: '+error.css',
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

    private error_html = (props: HTSXProps) => { return `<h1>${props.ctx?.response.status}</h1>`}
    private error_css = ''

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
                        view_head: null,
                        view: null,
                        js: null,
                        css: null,

                        get: null,
                        head: null,
                        patch: null,
                        options: null,
                        delete: null,
                        post: null,
                        put: null,
                    }
                })
            }
            const existing_endpoint = this.endpoints.findIndex(value => value.path === endpoint_path)
            if (entry.name === HTSXViewFileNames.page_server) this.endpoints[existing_endpoint].handlers.view = (await import(`file://${absolute_path}`)).default
            if (entry.name === HTSXViewFileNames.page_server) this.endpoints[existing_endpoint].handlers.view_head = (await import(`file://${absolute_path}`)).HEAD
            if (entry.name === HTSXViewFileNames.page_client_js) this.endpoints[existing_endpoint].handlers.js = await Deno.readTextFile(absolute_path)
            if (entry.name === HTSXViewFileNames.page_client_css) this.endpoints[existing_endpoint].handlers.css = await Deno.readTextFile(absolute_path)
            
            if (entry.name === HTSXApiFileNames.endpoint_get) this.endpoints[existing_endpoint].handlers.get = (await import(`file://${absolute_path}`)).default
            if (entry.name === HTSXApiFileNames.endpoint_head) this.endpoints[existing_endpoint].handlers.head = (await import(`file://${absolute_path}`)).default
            if (entry.name === HTSXApiFileNames.endpoint_patch) this.endpoints[existing_endpoint].handlers.patch = (await import(`file://${absolute_path}`)).default
            if (entry.name === HTSXApiFileNames.endpoint_options) this.endpoints[existing_endpoint].handlers.options = (await import(`file://${absolute_path}`)).default
            if (entry.name === HTSXApiFileNames.endpoint_delete) this.endpoints[existing_endpoint].handlers.delete = (await import(`file://${absolute_path}`)).default
            if (entry.name === HTSXApiFileNames.endpoint_post) this.endpoints[existing_endpoint].handlers.post = (await import(`file://${absolute_path}`)).default
            if (entry.name === HTSXApiFileNames.endpoint_put) this.endpoints[existing_endpoint].handlers.put = (await import(`file://${absolute_path}`)).default


        }

        const error_path = path.join(this.options.root, HTSXRootFileNames.error)
        const error_path_css = path.join(this.options.root, HTSXRootFileNames.error_css)
        const error_html = await exists(error_path) === true ? (await import(`file://${error_path}`)).default : null
        const error_css = await exists(error_path_css) === true ? await Deno.readTextFile(error_path_css) : null
        if (error_html !== null)
        this.error_html = error_html
        if (error_html !== null)
        this.error_css = error_css!

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
        const style_node = document?.createElement('link')
        style_node?.setAttribute('rel', 'stylesheet')
        style_node?.setAttribute('type', 'text/css')
        style_node?.setAttribute('href', `data:text/css;base64,${base64.encodeBase64(style_string).toString()}`)
        document?.head.appendChild(style_node!)
        return `<!DOCTYPE html>\n${document?.documentElement?.outerHTML}`
    }

    private async root(props?: HTSXProps) {
        await this.initialized;

        const root_path = path.join(this.options.root, HTSXRootFileNames.root)
        const root_path_css = path.join(this.options.root, HTSXRootFileNames.root_css)
        const root_import = await import(`file://${root_path}`)
        const root_css = await exists(root_path_css) === true ? await Deno.readTextFile(root_path_css) : null

        const root_html = await root_import.default(props)
        const document = new DOMParser().parseFromString(root_html, "text/html")!

        if (root_css !== null) {
            const style = document.createElement("style")!
            style.innerHTML = root_css
            document?.head.appendChild(style)
        }




        return document?.documentElement?.outerHTML!
    }

    private async handle_view(path: string, props?: HTSXRenderProps) {
        await this.initialized;
        const router = this.options.server.router
        router.get(path, async (ctx) => {
            let status = 200
            const endpoint = this.endpoints.find(endpoint => endpoint.path === path && endpoint.type === 'view')!
            if (endpoint === undefined) status = 404
            const rendered = await this.root({ 
                body: await endpoint.handlers.view!({...props, ...this.options.props?.payload !== undefined ? 
                    { payload: await this.options.props?.payload(ctx) } 
                    : 
                    {} 
                }),
                ctx: ctx,
                ...props?.root,
            })
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
            if (endpoint.handlers.view_head !== undefined) {
                const container = document.createElement('div');
                container.innerHTML = endpoint.handlers.view_head!.trim();
                container.childNodes.forEach((node) => {
                    document.head.appendChild(node)
                })
            }

            const filled_html = document?.documentElement?.outerHTML!
            const cleared_html = this.clean(filled_html)
            const minified_html = htmlm(cleared_html, {
                minifyJS: true,
                minifyCSS: true
            })

            ctx.response.status = status
            ctx.response.headers.set("Content-Type", "text/html")
            ctx.response.body = status === 200 ? minified_html : status
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
            const server_props = { ctx: ctx, ...props, ...this.options.props?.payload !== undefined ? { payload: await this.options.props?.payload(ctx) } : {} }
            ctx.response.status = status
            ctx.response.headers.set("Content-Type", "application/json")
            ctx.response.body = status === 200 ? JSON.stringify(await endpoint.handlers.get!(ctx, server_props!)) : status
        })

        if (endpoint.handlers.head !== null) 
        router.head(endpoint.path, async (ctx) => {
            const server_props = { ctx: ctx, ...props, ...this.options.props?.payload !== undefined ? { payload: await this.options.props?.payload(ctx) } : {} }
            ctx.response.status = status
            ctx.response.headers.set("Content-Type", "application/json")
            ctx.response.body = status === 200 ? JSON.stringify(await endpoint.handlers.head!(ctx, server_props!)) : status
        })

        if (endpoint.handlers.patch !== null) 
        router.patch(endpoint.path, async (ctx) => {
            const server_props = { ctx: ctx, ...props, ...this.options.props?.payload !== undefined ? { payload: await this.options.props?.payload(ctx) } : {} }
            ctx.response.status = status
            ctx.response.headers.set("Content-Type", "application/json")
            ctx.response.body = status === 200 ? JSON.stringify(await endpoint.handlers.patch!(ctx, server_props!)) : status
        })

        if (endpoint.handlers.options !== null) 
        router.options(endpoint.path, async (ctx) => {
            const server_props = { ctx: ctx, ...props, ...this.options.props?.payload !== undefined ? { payload: await this.options.props?.payload(ctx) } : {} }
            ctx.response.status = status
            ctx.response.headers.set("Content-Type", "application/json")
            ctx.response.body = status === 200 ? JSON.stringify(await endpoint.handlers.options!(ctx, server_props!)) : status
        })

        if (endpoint.handlers.delete !== null) 
        router.delete(endpoint.path, async (ctx) => {
            const server_props = { ctx: ctx, ...props, ...this.options.props?.payload !== undefined ? { payload: await this.options.props?.payload(ctx) } : {} }
            ctx.response.status = status
            ctx.response.headers.set("Content-Type", "application/json")
            ctx.response.body = status === 200 ? JSON.stringify(await endpoint.handlers.delete!(ctx, server_props!)) : status
        })


        if (endpoint.handlers.post !== null) 
        router.post(endpoint.path, async (ctx) => {
            const server_props = { ctx: ctx, ...props, ...this.options.props?.payload !== undefined ? { payload: await this.options.props?.payload(ctx) } : {} }
            ctx.response.status = status
            ctx.response.headers.set("Content-Type", "application/json")
            ctx.response.body = status === 200 ? JSON.stringify(await endpoint.handlers.post!(ctx, server_props!)) : status
        })

        if (endpoint.handlers.put !== null) 
        router.put(endpoint.path, async (ctx) => {
            const server_props = { ctx: ctx, ...props, ...this.options.props?.payload !== undefined ? { payload: await this.options.props?.payload(ctx) } : {} }
            ctx.response.status = status
            ctx.response.headers.set("Content-Type", "application/json")
            ctx.response.body = status === 200 ? JSON.stringify(await endpoint.handlers.put!(ctx, server_props!)) : status
        })

    }

    private async serve() {
        await this.initialized;

        if (this.options.logger !== undefined)
        this.options.server.app.use(async (ctx, next) => {
            await next();
            this.options.logger!(ctx)
        });

        this.options.server.app.use(async (ctx, next) => {
            
            await next()
            
            const path = this.endpoints.find(endpoint => endpoint.path === ctx.request.url.pathname)
            if (path === undefined || ctx.response.status !== 200) { 
                const error_document = new DOMParser().parseFromString(await this.error_html({ ctx: ctx }), 'text/html')!
                if (this.error_css !== '') {
                    const style = error_document.createElement("style")
                    style.innerHTML = (cssm(this.error_css, { restructure: true })).css
                    error_document?.head.appendChild(style)
                }

                const cleared_html = this.clean(error_document.documentElement?.outerHTML!)
                const minified_html = htmlm(cleared_html, {
                    minifyJS: true,
                    minifyCSS: true
                })

                ctx.response.status = 404
                ctx.response.headers.set("Content-Type", "text/html")
                ctx.response.body = minified_html
            }
        });

        this.endpoints.forEach((endpoint) => {
            if (endpoint.type === "api") this.handle_api(endpoint.path, this.options.props)
            if (endpoint.type === "view") this.handle_view(endpoint.path, this.options.props)
        })
        this.options.server.app.use(this.options.server.router.routes());
        this.options.server.app.use(this.options.server.router.allowedMethods());


          
        this.options.server.init()
    }
}

interface HTSXFlexParams {
    direction?: 'row' | 'row-reverse' | 'column' | 'column-reverse';
    justify?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
    align?: 'stretch' | 'flex-start' | 'flex-end' | 'center' | 'baseline';
    content?: 'stretch' | 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around';
    wrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
    gap?: string
}

export const HTSXUtils = {
    for: (times: number, iterator: () => string, join = '\n') => {
        const result = []
        for (let i = 0; i < times; i++) {
            result.push(iterator());
        }
        return result.join(join)
    },
    each: <T = any>(arr: T[], iterator: (item: T) => string, join = '\n') => {
        const result = []
        for (let i = 0; i < arr.length; i++) {
                result.push(iterator(arr[i]));
        }
        return result.join(join)
    },
    flex: (params: HTSXFlexParams) => {
        const styles: string[] = [];
        styles.push('display: flex')
        if (params.direction) styles.push(`flex-direction: ${params.direction}`)
        if (params.justify) styles.push(`justify-content: ${params.justify}`)
        if (params.align) styles.push(`align-items: ${params.align}`)
        if (params.content) styles.push(`align-content: ${params.content}`)
        if (params.wrap) styles.push(`flex-wrap: ${params.wrap}`)
        if (params.gap) styles.push(`gap: ${params.gap}`)
        return styles.join(';\n');
    }
}