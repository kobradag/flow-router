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
		let regExp = /(import|export)([^'"].*)from[ ]*['"]([^\.\/][^'"].*)['"]/g;
        let folders = [];
		this.options = Object.assign({folders, rootFolder, regExp, useCache:0}, options)
		this.rootFolder = this.options.rootFolder;
		this.regExp = this.options.regExp;
	}
    /**
    * inject express middleware for lit-html, lit-element static file serving
    */
	init(){
        this.options.folders.map(folder=>{
            this.app.use(folder, this.router(folder));
        });
        this.app.use("/node_modules/@aspectron/flow-ux", this.router("/node_modules/@aspectron/flow-ux"));
		this.app.use("/node_modules/lit-html", this.router("/node_modules/lit-html"));
        this.app.use("/node_modules/lit-element", this.router("/node_modules/lit-element"));
        this.app.use("/node_modules/lit-html", serveStatic(path.join(this.rootFolder, '/node_modules/lit-html/')));
        this.app.use("/node_modules/lit-element", serveStatic(path.join(this.rootFolder, '/node_modules/lit-element')));
    }
    router(folder){
        return (req, res, next)=>{
            let file = path.join(this.rootFolder, folder, req.url)
            file = file.split("?")[0];
            if(!fs.existsSync(file))
                return next();
            if(!/(\.css|\.js)$/.test(file)){
                //console.log("file", file);
                res.sendFile(file)
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
            return `${b} ${c} from "/node_modules/${d}"`;
        });
    }
}

module.exports = FlowRouter;