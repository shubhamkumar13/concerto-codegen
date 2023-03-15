/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';
const ModelUtil = require('@accordproject/concerto-core').ModelUtil;
const util = require('util');

// Rust keywords
const keywords = [
    "abstract", "as", "async", "await", "become", "box", "break", "const", "continue", "crate", "do", "dyn",
    "else", "enum", "extern", "false", "final", "fn", "for", "if", "impl", "in", "let", "loop", "macro",
    "match", "mod", "move", "mut", "override", "priv", "pub", "ref", "return", "self", "static", "struct",
    "super", "trait", "true", "try", "type", "typeof", "unsafe", "unsized", "use", "virtual", "where",
    "while", "yield",
];

// Valid characters for Rust names.
const validChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";

/**
 * Convert the contents of a ModelManager to Rust code.
 * All generated modules are referenced from the 'lib' package
 * with all generated modules in the same file system folder.
 *
 * @private
 * @class
 * @memberof module:concerto-tools
 */
class RustVisitor {

    /**
      * Visitor design pattern
      * @param {Object} thing - the object being visited
      * @param {Object} parameters  - the parameter
      * @return {Object} the result of visiting or null
      */
    visit(thing, parameters) {
        if (thing.isModelManager?.()) {
            return this.visitModelManager(thing, parameters);
        } else if (thing.isModelFile?.()) {
            return this.visitModelFile(thing, parameters);
        } else if (thing.isEnum?.()) {
            return this.visitEnumDeclaration(thing, parameters);
        } else if (thing.isClassDeclaration?.()) {
            return this.visitClassDeclaration(thing, parameters);
        } else if (thing.isTypeScalar?.()) {
            return this.visitScalarField(thing, parameters);
        } else if (thing.isField?.()) {
            return this.visitField(thing, parameters);
        } else if (thing.isRelationship?.()) {
            return this.visitRelationship(thing, parameters);
        } else if (thing.isEnumValue?.()) {
            return this.visitEnumValueDeclaration(thing, parameters);
        } else if (thing.isScalarDeclaration?.()) {
            return;
        } else {
            throw new Error('Unrecognised type: ' + typeof thing + ', value: ' + util.inspect(thing, {
                showHidden: true,
                depth: 2
            }));
        }
    }

    /**
     * Visitor design pattern
     * @param {ModelManager} modelManager - the object being visited
     * @param {Object} parameters  - the parameter
     * @return {Object} the result of visiting or null
     * @private
     */
    visitModelManager(modelManager, parameters) {

        // Create the "lib.rs" file containing the module references.
        const fileName = `lib.rs`;
        parameters.fileWriter.openFile(fileName);
        for (const namespace of modelManager.getNamespaces()) {
            const namespaceFile = modelManager.getModelFile(namespace);
            const namespaceFileName = this.toValidRustName(namespace);
            parameters.fileWriter.writeLine(0, `pub mod ${namespaceFileName};`);
        }
        parameters.fileWriter.closeFile();

        // Create the files for each namespace.
        modelManager.getModelFiles(true).forEach((modelFile) => {
            modelFile.accept(this, parameters);
        });
        return null;
    }

    /**
     * Visitor design pattern
     * @param {ModelFile} modelFile - the object being visited
     * @param {Object} parameters  - the parameter
     * @return {Object} the result of visiting or null
     * @private
     */
    visitModelFile(modelFile, parameters) {
        const fileName = this.toValidRustName(modelFile.getNamespace());
        parameters.fileWriter.openFile(`${fileName}.rs`);

        // Add crate definition as first line in file. 
        parameters.fileWriter.writeLine(0, `use serde::{Deserialize, Serialize};`);

        modelFile.getImports().map(importString =>
            ModelUtil.getNamespace(importString))
            .filter(namespace => namespace !== modelFile.getNamespace()) // Skip own namespace.
            .filter((v, i, a) => a.indexOf(v) === i) // Remove any duplicates from direct imports
            .forEach(namespace => {
                parameters.fileWriter.writeLine(0, `use crate::${this.toValidRustName(namespace)}::*;`);
            });

        parameters.fileWriter.writeLine(1, '');

        modelFile.getAllDeclarations().forEach((decl) => {
            decl.accept(this, parameters);
        });

        parameters.fileWriter.closeFile();

        return null;
    }

    /**
     * Visitor design pattern
     * @param {EnumDeclaration} enumDeclaration - the object being visited
     * @param {Object} parameters  - the parameter
     * @return {Object} the result of visiting or null
     * @private
     */
    visitEnumDeclaration(enumDeclaration, parameters) {

        parameters.fileWriter.writeLine(0, 'enumDeclaration - ' + enumDeclaration.getName() + ' - ');

        parameters.fileWriter.writeLine(0, 'property - ');

        enumDeclaration.getOwnProperties().forEach((property) => {
            property.accept(this, parameters);
        });

        parameters.fileWriter.writeLine(0, ' - ');
        return null;
    }

    /**
     * Visitor design pattern
     * @param {ClassDeclaration} classDeclaration - the object being visited
     * @param {Object} parameters  - the parameter
     * @return {Object} the result of visiting or null
     * @private
     */
    visitClassDeclaration(classDeclaration, parameters) {
        parameters.fileWriter.writeLine(0, '#[derive(Debug, Serialize, Deserialize)]');
        parameters.fileWriter.writeLine(0, 'pub struct ' + classDeclaration.getName() + '{ ');

        classDeclaration.getOwnProperties().forEach((property) => {
            property.accept(this, parameters);
        });

        parameters.fileWriter.writeLine(0, '}');
        parameters.fileWriter.writeLine(0, '');
        return null;
    }

    /**
     * Visitor design pattern
     * @param {Field} field - the object being visited
     * @param {Object} parameters  - the parameter
     * @return {Object} the result of visiting or null
     * @private
     */
    visitField(field, parameters) {
        let array = '';

        // if (field.isArray()) {
        //     array = '[]';
        // }

        parameters.fileWriter.writeLine(1, `#[serde(rename = "${field.getName()}")]`);
        parameters.fileWriter.writeLine(1, `pub ${this.toValidRustName(field.getName())} : ${field.getType()},`);
        return null;
    }

    /**
     * Visitor design pattern
     * @param {Relationship} relationship - the object being visited
     * @param {Object} parameters  - the parameter
     * @return {Object} the result of visiting or null
     * @private
     */
    visitRelationship(relationship, parameters) {
        let array = '';

        // if (relationship.isArray()) {
        //     array = '[]';
        // }

        parameters.fileWriter.writeLine(1, `#[serde(rename = "${relationship.getName()}"`);
        parameters.fileWriter.writeLine(1, `pub ${relationship.getName()} : ${relationship.getType()},`);
        return null;
    }

    /**
     * Visitor design pattern
     * @param {EnumValueDeclaration} enumValueDeclaration - the object being visited
     * @param {Object} parameters  - the parameter
     * @return {Object} the result of visiting or null
     * @private
     */
    visitEnumValueDeclaration(enumValueDeclaration, parameters) {


        // we export all fields by capitalizing them
        parameters.fileWriter.writeLine(1, "enumValueDeclaration - " + enumValueDeclaration.getName());
        return null;
    }


    /**
     * Convert any string into a valid Rust name.
     * @param {string} input 
     * @returns {string}
     */
    toValidRustName(input) {

        // Replace any invalid characters with an underscore.
        let result = Array.from(input, c => validChars.includes(c) ? c : '_').join('');

        // Convert the string to snake case.
        result = result.replace(/[A-Z]/g, (match, offset) => {
            if (offset === 0) {
                return match.toLowerCase();
            }
            return `_${match.toLowerCase()}`;
        });

        // Add an underscore to the beginning if the first character is invalid.
        if (!validChars.includes(result.charAt(0))) {
            result = `_${result}`;
        }

        while (keywords.includes(result)) {
            result += '_';
        }

        return result;
    }

    /**
     * Converts a Concerto namespace to a Go package name.
     * @param {string} namespace  - the concerto type
     * @return {string} the corresponding package name in Rust
     * @private
     */
    toRustCrateName(namespace) {
        return namespace.replace(/@/g, '_').replace(/\./g, '_');
    }

}

module.exports = RustVisitor;