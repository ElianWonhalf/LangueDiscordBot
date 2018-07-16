const wd = require("./index.js");
const options = {exact:false, hyperlinks: "none"};

wd.getDef("leprome", "fr", options, function(definition) {
	console.log(definition);
});