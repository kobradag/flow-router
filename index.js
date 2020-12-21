const Router = (typeof vertex === 'undefined' ) ? require("./lib/router") : require("./lib/vertex-router");
module.exports = Router;