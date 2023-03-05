'use strict';

const fs = require('fs');

const { ModelManager } = require('@accordproject/concerto-core');
const { FileWriter } = require('@accordproject/concerto-util');

const Visitor = require('./lib/codegen/fromcto/rust/rustvisitor');

const modelPath = './testharness/model-helloworld.cto';
// const modelPath = './testharness/model-minimal.cto';
const model = fs.readFileSync(modelPath, 'utf8');

const modelManager = new ModelManager();

modelManager.addCTOModel(model);
modelManager.updateExternalModels();
modelManager.validateModelFiles();

const parameters = {
  fileWriter: new FileWriter('./output/rust')
};
const visitor = new Visitor();

modelManager.accept(visitor, parameters);
console.log('Done');