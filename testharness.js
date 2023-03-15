const fs = require('fs');
const { ModelManager } = require('@accordproject/concerto-core');
const { FileWriter } = require('@accordproject/concerto-util');
const Visitor = require('./lib/codegen/fromcto/rust/rustvisitor');

try {
  const modelFilePath = process.argv[2];
  if (!modelFilePath) { // ensure model file path is provided
    console.log('Usage: node testharness.js <model filepath & filename> <output filepath>');
    process.exit(1);
  }
  const model = fs.readFileSync(modelFilePath, 'utf8');
  const mm = new ModelManager();

  mm.addCTOModel(model, modelFilePath, true);  // true to disable consistency checks on imports
  mm.updateExternalModels();

  let outputFilePath = process.argv[3];
  if (!outputFilePath) {  // ensure output file path is provided
    console.log('Usage: node testharness.js <model file> <output file>');
    process.exit(1);
  };
  if (!outputFilePath.endsWith('/')) {  // ensure output file path ends with '/'
    outputFilePath += '/';
  };

  const parameters = {
    fileWriter: new FileWriter(outputFilePath)
  };
  const visitor = new Visitor();

  mm.accept(visitor, parameters);
  console.log('Code generation complete. Output files are in ' + outputFilePath + '.');

}
catch (err) {
  console.log(err)
}