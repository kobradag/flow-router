const Router = (typeof vertx !== 'undefined' && vertx !== null) ? require("./lib/vertx-router") : require("./lib/router");
module.exports = Router;