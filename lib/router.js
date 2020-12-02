const path = require('path');
const fs = require('fs');
const serveStatic = require('serve-static')

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
		let rootFolder = path.join(path.dirname(__filename), '../../');
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
        let {mount} = this.options
        if(!mount)
            mount = {};

        this.mount = Object.assign({
            flowUX: "/node_modules/@aspectron/flow-ux",
            litHtml: "/node_modules/lit-html",
            litElement: "/node_modules/lit-element",
            webcomponents:"/node_modules/@webcomponents/webcomponentsjs"
        }, mount)

        let {flowUX, litHtml, litElement, webcomponents} = this.mount;

        this.urlProxies = [
            {url:"/node_modules/@aspectron/flow-ux", proxyUrl:flowUX},
            {url:"/node_modules/lit-html", proxyUrl:litHtml},
            {url:"/node_modules/lit-element", proxyUrl:litElement},
            {url:"/node_modules/@webcomponents/webcomponentsjs", proxyUrl:webcomponents}
        ];

        this.options.folders.map(f=>{
            if(f.url && f.folder)
                this.urlProxies.push({url:f.folder, proxyUrl:f.url})

            this.app.use(f.url||f, this.router(f.folder||f));
        });

        this.app.use(flowUX, this.router("/node_modules/@aspectron/flow-ux"));
        this.app.use(litHtml, this.router("/node_modules/lit-html"));
        this.app.use(litElement, this.router("/node_modules/lit-element"));
        this.app.use(litHtml, serveStatic(path.join(this.rootFolder, '/node_modules/lit-html/')));
        this.app.use(litElement, serveStatic(path.join(this.rootFolder, '/node_modules/lit-element')));
        this.app.use(webcomponents, serveStatic(path.join(this.rootFolder, '/node_modules/@webcomponents/webcomponentsjs')));
    }
    router(folder){
        return (req, res, next)=>{
            let file = path.join(this.rootFolder, folder, req.url)
            file = file.split("?")[0];
            if(!fs.existsSync(file))
                return next();
            if(!/(\.css|\.js)$/.test(file)){
                //console.log("file", file);
                if(res.sendFile)
                    res.sendFile(file)
                else
                   serveStatic(path.join(this.rootFolder, folder))(req, res, next)
                return
            }
            if(fs.statSync(file).isDirectory())
                file = path.join(file, file.split("/").pop()+".js")

            
            if(!fs.existsSync(file))
                return next();
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
                
            if(/\.css$/.test(file)){
                res.setHeader('Content-Type', 'text/css');
            }else{
                res.setHeader('Content-Type', 'application/javascript');
            }
            res.end(content);
        }
    }
    getContent(file){
        return (fs.readFileSync(file)+"").replace(this.regExp, (a, b, c, d)=>{
            //'import $1 from "/node_modules/$2"'
            //console.log("a, b, c", a, b, c, d)
            if(!/\.js$/.test(d))
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