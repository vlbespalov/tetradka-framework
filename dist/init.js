"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initFramework = initFramework;
const transaction_1 = require("./transaction");
const controller_loader_1 = require("./controller-loader");
function initFramework(config) {
    (0, transaction_1.setDataSource)(config.dataSource);
    (0, controller_loader_1.setControllersDir)(config.controllersDir);
}
//# sourceMappingURL=init.js.map