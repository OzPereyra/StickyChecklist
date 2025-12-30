const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class Store {
    constructor(opts) {
        const userDataPath = app.getPath('userData');
        this.path = path.join(userDataPath, opts.configName + '.json');
        this.defaults = opts.defaults;
        this.data = this.parseDataFile(this.path, this.defaults);
    }

    get(key) {
        return this.data[key];
    }

    set(key, val) {
        this.data[key] = val;
        fs.writeFileSync(this.path, JSON.stringify(this.data));
    }

    parseDataFile(filePath, defaults) {
        try {
            return JSON.parse(fs.readFileSync(filePath));
        } catch (error) {
            return defaults;
        }
    }
}

module.exports = Store;
