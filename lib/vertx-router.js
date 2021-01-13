import {Router, StaticHandler} from "@vertx/web";
const Paths = Java.type('java.nio.file.Paths');

/**
* @typedef {Object} RouterOptions
* @prop {String} [rootFolder=<current dir>]
* @prop {boolean} [useCache=false]
* @@prop {RegExp} [regExp] default: <code class="prettyprint js">/(import|export)([^'"].*)from[ ]*['"]([^\.\/][^'"].*)['"]/g</code>
*/
/**
* @class FlowRouter
* @category Utils
* @param {ExpressApp} app Express() instance <code class="prettyprint js">const app = express();</code> 
* @param {RouterOptions} [options={}] 
*
* @example
* const express = require('express');
* const path = require('path');
* const {FlowRouter} = require('flow-utils'); //<----
*
* const app = express();
* const port = 3000;
* const rootFolder = path.dirname(__filename);
* app.get('/', (req, res) => res.sendFile(path.join(rootFolder, 'modules/flow/flow.html')))
* app.listen(port, () => console.log(`Flow-UX example app listening on port ${port}!`));
*
* (new FlowRouter(app, {rootFolder})).init(); //<----
*
* app.use(express.static(rootFolder));
* 
*/
class FlowRouter {
	constructor(app, options={}){
		this.app = app;
		this.cache = {};
		this.setOptions(options);
	}
	setOptions(options={}){
		let rootFolder = Paths.get(__filename).getParent().getParent();
		let regExp = /(import|export)([^'"].*)from[ ]*['"]([^'"].*)['"]/g;
        let folders = [];
		this.options = Object.assign({folders, rootFolder, regExp, useCache:0}, options)
		this.rootFolder = this.options.rootFolder;
		this.regExp = this.options.regExp;
	}
    /**
    * inject express middleware for lit-html, lit-element static file serving
    */
	init(){
        let appFolder = Paths.get(process.cwd());
        let {mount, sources={}} = this.options
        if(!mount)
            mount = {};

        this.mount = Object.assign({
            flowUX: "/node_modules/@aspectron/flow-ux",
            litHtml: "/node_modules/lit-html",
            litElement: "/node_modules/lit-element",
            sockjs: "/node_modules/sockjs-client/dist",
            webcomponents:"/node_modules/@webcomponents/webcomponentsjs"
        }, mount)

        this.sources = Object.assign({
            flowUX: "node_modules/@aspectron/flow-ux",
            litHtml: "node_modules/lit-html",
            litElement: "node_modules/lit-element",
            sockjs: "node_modules/sockjs-client/dist",
            webcomponents:"node_modules/@webcomponents/webcomponentsjs"
        }, sources)

        let {flowUX, litHtml, litElement, sockjs, webcomponents} = this.mount;

        this.urlProxies = [
            {url:"/node_modules/@aspectron/flow-ux", proxyUrl:flowUX},
            {url:"/node_modules/lit-html", proxyUrl:litHtml},
            {url:"/node_modules/lit-element", proxyUrl:litElement},
            {url:"/node_modules/sockjs-client/dist", proxyUrl:sockjs},
            {url:"/node_modules/@webcomponents/webcomponentsjs", proxyUrl:webcomponents}
        ];

        this.options.folders.map(f=>{
            if(f.url && f.folder)
                this.urlProxies.push({url:f.folder, proxyUrl:f.url})

            this.app.mountSubRouter(f.url||f, this.router(f.folder||f))
        });

        this.app.mountSubRouter(flowUX, this.router(this.sources.flowUX));
        this.app.mountSubRouter(litHtml, this.router(this.sources.litHtml));
        this.app.mountSubRouter(litElement, this.router(this.sources.litElement));
        this.app.route(litHtml + "/*").handler(StaticHandler.create(appFolder.relativize(this.rootFolder.resolve(this.sources.litHtml)).toString()));
        this.app.route(litElement + "/*").handler(StaticHandler.create(appFolder.relativize(this.rootFolder.resolve(this.sources.litElement)).toString()));
        this.app.route(sockjs + "/*").handler(StaticHandler.create(appFolder.relativize(this.rootFolder.resolve(this.sources.sockjs)).toString()));
        this.app.route(webcomponents + "/*").handler(StaticHandler.create(appFolder.relativize(this.rootFolder.resolve(this.sources.webcomponents)).toString()));
    }
    router(folder){
        let router = Router.router(vertx);
        router.route().handler(ctx => {
            let file = this.rootFolder
                .resolve(folder)
                .resolve(
                    Paths.get(
                        ctx.normalizedPath()
                            .substring(ctx.mountPoint().length + 1)
                            .split("?")[0]
                    )
                )
            if(!vertx.fileSystem().existsBlocking(file.toString()))
                return ctx.next();
            if(!/(\.css|\.js)$/.test(file.toString())){
                return ctx.response().sendFile(file.toString())
            }
            if(vertx.fileSystem().propsBlocking(file.toString()).isDirectory())
                file = file.resolve(file.getFileName().toString() +".js")


            if(!vertx.fileSystem().existsBlocking(file.toString()))
                return ctx.next;
            let content;
            if(this.options.useCache){
                content = this.cache[file];
                if(!content){
                    content = this.getContent(file);
                    this.cache[file] = content;
                }
            }else{
                content = this.getContent(file);
            }

            ctx.response().setChunked(true)
            if(/\.css$/.test(file)){
                ctx.response().putHeader('Content-Type', 'text/css')
            }else{
                ctx.response().putHeader('Content-Type', 'application/javascript')
            }
            ctx.response().write(content);
            return ctx.response().end();
        });
        return router;
    }
    getContent(file){
        return (vertx.fileSystem().readFileBlocking(file.toString())+"").replace(this.regExp, (a, b, c, d)=>{
            //'import $1 from "/node_modules/$2"'
            //console.log("a, b, c", a, b, c, d)
            if(!/\.m?js$/.test(d))
                d += "/"+d.split("/").pop()+".js";
            if(/^\./.test(d))
                return `${b} ${c} from "${d}"`;

            let found = this.urlProxies.find(p=>{
                return d.indexOf(p.proxyUrl)===0;
            })
            if(found)
                return `${b} ${c} from "${d}"`;

            if(!/^\/node_modules/.test(d))
                d = `/node_modules/${d}`;

            this.urlProxies.forEach(p=>{
                if(d.indexOf(p.url)===0)
                    d = d.replace(p.url, p.proxyUrl);
            })

            return `${b} ${c} from "${d}"`;
        });
    }
}

module.exports = FlowRouter;