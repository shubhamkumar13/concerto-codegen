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
const { Console } = require('console');
const util = require('util');
const RecursionDetectionVisitor = require('./recursionvisitor');

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
     * Helper method: Convert any string into a valid Rust name.
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
     * Helper method: Converts a Concerto namespace to a Rust crate name.
     * @param {string} namespace  - the concerto type
     * @return {string} the corresponding package name in Rust
     * @private
     */
    toRustCrateName(namespace) {
        return namespace.replace(/@/g, '_').replace(/\./g, '_');
    }

    /**
     * Returns true if the class declaration contains recursive references.
     *
     * Basic example:
     * concept Person {
     *   o Person[] children
     * }
     *
     * @param {object} classDeclaration the class being visited
     * @returns {boolean} true if the model is recursive
     */
    isModelRecursive(classDeclaration) {
        const visitor = new RecursionDetectionVisitor();
        return classDeclaration.accept(visitor, { stack: [] });
    }

    /**
     * Gets an object with all the decorators for a model element. The object
     * is keyed by decorator name, while the values are the decorator arguments.
     * @param {object} decorated a ClassDeclaration or a Property
     * @returns {object} the decorators
     */
    getDecorators(decorated) {
        // add information about decorators
        return decorated.getDecorators() && decorated.getDecorators().length > 0
            ? decorated.getDecorators().reduce((acc, d) => {
                acc[d.getName()] = d.getArguments();
                return acc;
            }, {})
            : null;
    }

    /**
     * Visitor design pattern
     * @param {Object} thing - the object being visited
     * @param {Object} parameters - the parameter
     * @return {Object} the result of visiting or null
     * @public
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
            return this.visitField(thing.getScalarField(), parameters);
        } else if (thing.isField?.()) {
            return this.visitField(thing, parameters);
        } else if (thing.isRelationship?.()) {
            return this.visitRelationshipDeclaration(thing, parameters);
        } else if (thing.isScalarDeclaration?.()) {
            return this.visitScalarDeclaration(thing, parameters);
        } else if (thing.isEnumValue?.()) {
            return this.visitEnumValueDeclaration(thing, parameters);
        } else {
            throw new Error('Unrecognised type: ' + typeof thing + ', value: ' + util.inspect(thing, { showHidden: true, depth: null }));
        }
    }

    /**
     * Visitor design pattern
     * @param {ModelManager} modelManager - the object being visited
     * @param {Object} parameters - the parameter
     * @return {Object} the result of visiting or null
     * @private
     */
    visitModelManager(modelManager, parameters) {
        console.log('entering visitModelManager');

        // Create the "lib.rs" file containing the module references.
        const fileName = `lib.rs`;
        parameters.fileWriter.openFile(fileName);
        for (const namespace of modelManager.getNamespaces()) {
            const namespaceFileName = this.toValidRustName(namespace);
            parameters.fileWriter.writeLine(0, `pub mod ${namespaceFileName};`);
        }
        parameters.fileWriter.writeLine(0, `pub mod utils;`);
        parameters.fileWriter.closeFile();

        this.addUtilsModelFile(parameters)

        // Create the files for each namespace.
        modelManager.getModelFiles(true).forEach((modelFile) => {
            modelFile.accept(this, parameters);
        });

        return null;
    }

    /**
     * Visitor design pattern
     * @param {ModelFile} modelFile - the object being visited
     * @param {Object} parameters - the parameter
     * @return {Object} the result of visiting or null
     * @private
     */
    visitModelFile(modelFile, parameters) {
        console.log('entering visitModelFile', modelFile.getNamespace());

        // Create the file for the namespace with a valid Rust name.
        const fileName = this.toValidRustName(modelFile.getNamespace());
        parameters.fileWriter.openFile(`${fileName}.rs`);

        // Add crate definition as first line in file. 
        parameters.fileWriter.writeLine(0, `use serde::{ Deserialize, Serialize };`);
        parameters.fileWriter.writeLine(0, `use chrono::{ DateTime, TimeZone, Utc };`);
        parameters.fileWriter.writeLine(1, '');

        // Add imports.
        modelFile.getImports().map(importString =>
            ModelUtil.getNamespace(importString))
            .filter(namespace => namespace !== modelFile.getNamespace()) // Skip own namespace.
            .filter((v, i, a) => a.indexOf(v) === i) // Remove any duplicates from direct imports
            .forEach(namespace => {
                parameters.fileWriter.writeLine(0, `use crate::${this.toValidRustName(namespace)}::*;`);
            });

        parameters.fileWriter.writeLine(0, `use crate::utils::*;`);

        parameters.fileWriter.writeLine(1, '');

        // Visit all of the asset and transaction declarations
        modelFile.getAllDeclarations().forEach((declaration) => {
            declaration.accept(this, parameters);
        });

        parameters.fileWriter.closeFile();
        return null;
    }

    /**
     * Visitor design pattern
     * @param {AssetDeclaration} assetDeclaration - the object being visited
     * @param {Object} parameters - the parameter
     * @return {Object} the result of visiting or null
     * @private
     */
    visitAssetDeclaration(assetDeclaration, parameters) {
        console.log('entering visitAssetDeclaration', assetDeclaration.getName());
        parameters.fileWriter.writeLine(0, `pub struct ${assetDeclaration.getName()} {`);

        assetDeclaration.getOwnProperties().forEach((property) => {
            property.accept(this, parameters);
        });

        parameters.fileWriter.writeLine(0, `}`);
        parameters.fileWriter.writeLine(0, '');



        return null;
    }

    /**
     * Visitor design pattern
     * @param {TransactionDeclaration} transactionDeclaration - the object being visited
     * @param {Object} parameters - the parameter
     * @return {Object} the result of visiting or null
     * @private
     */
    visitTransactionDeclaration(transactionDeclaration, parameters) {
        console.log('entering visitTransactionDeclaration', transactionDeclaration.getName());
        parameters.fileWriter.writeLine(0, 'transactionDeclaration - ' + transactionDeclaration.getName());

        transactionDeclaration.getOwnProperties().forEach((property) => {
            property.accept(this, parameters);
        });

        return null;
    }

    /**
     * Visitor design pattern
     * @param {ConceptDeclaration} conceptDeclaration - the object being visited
     * @param {Object} parameters - the parameter
     * @return {Object} the result of visiting or null
     * @private
     */
    visitConceptDeclaration(conceptDeclaration, parameters) {
        console.log('entering visitConceptDeclaration', conceptDeclaration.getName());
        parameters.fileWriter.writeLine(0, 'conceptDeclaration - ' + conceptDeclaration.getName());
        return null;
    }

    /**
     * Visitor design pattern
     * @param {ClassDeclaration} classDeclaration - the object being visited
     * @param {Object} parameters - the parameter
     * @return {Object} the result of visiting or null
     * @private
     */
    visitClassDeclaration(classDeclaration, parameters) {
        console.log('entering visitClassDeclaration', classDeclaration.getName());
        parameters.fileWriter.writeLine(0, '#[derive(Debug, Serialize, Deserialize)]')
        parameters.fileWriter.writeLine(0, `pub struct ${classDeclaration.getName()} {`);

        this.visitField({
            name: '$class',
            type: 'String'
        }, parameters)

        const properties = classDeclaration.getProperties().filter(property => !['identifier'].includes(property.name))
        properties.forEach((property) => {
            parameters.fileWriter.writeLine(1, '');
            property.accept(this, parameters);
        });

        parameters.fileWriter.writeLine(0, `}`);
        parameters.fileWriter.writeLine(0, '');
        return null;
    }

    /**
     * Visitor design pattern
     * @param {ScalarDeclaration} scalarDeclaration - the object being visited
     * @param {Object} parameters - the parameter
     * @return {Object} the result of visiting or null
     * @private
     */
    visitScalarDeclaration(scalarDeclaration, parameters) {
        console.log('entering visitScalarDeclaration', scalarDeclaration.getName());
        parameters.fileWriter.writeLine(0, 'scalarDeclaration - ' + scalarDeclaration.getName());
        return null;
    }

    /**
     * Visitor design pattern
     * @param {Field} field - the object being visited
     * @param {Object} parameters - the parameter
     * @return {Object} the result of visiting or null
     * @private
     */
    visitField(field, parameters) {


        let type = this.toRustType(field.type)
        if (field.isArray?.()) {
            type = `Vec<${type}>`
        }

        parameters.fileWriter.writeLine(1, "#[serde(");
        parameters.fileWriter.writeLine(2, `rename = "${field.name}",`)
        if (field.isOptional?.()) {
            parameters.fileWriter.writeLine(2, 'skip_serializing_if = "Option::is_none",')
            type = `Option<${type}>`
        }
        if (this.isDateField(field.type)) {
            if (field.isOptional?.()) {
                parameters.fileWriter.writeLine(2, 'serialize_with = "serialize_datetime_option",')
                parameters.fileWriter.writeLine(2, 'deserialize_with = "deserialize_datetime_option",')
            } else {
                parameters.fileWriter.writeLine(2, 'serialize_with = "serialize_datetime",')
                parameters.fileWriter.writeLine(2, 'deserialize_with = "deserialize_datetime",')

            }
        }
        parameters.fileWriter.writeLine(1, ")]");
        parameters.fileWriter.writeLine(1, `pub ${this.toValidRustName(field.name.replace('$', ''))}: ${type},`);
        return null;
    }

    /**
     * Visitor design pattern
     * @param {EnumDeclaration} enumDeclaration - the object being visited
     * @param {Object} parameters - the parameter
     * @return {Object} the result of visiting or null
     * @private
     */
    visitEnumDeclaration(enumDeclaration, parameters) {
        console.log('entering visitEnumDeclaration', enumDeclaration.getName());
        parameters.fileWriter.writeLine(0, '#[derive(Debug, Serialize, Deserialize)]')
        parameters.fileWriter.writeLine(0, 'pub enum ' + enumDeclaration.getName() + ' {');

        enumDeclaration.getOwnProperties().forEach((property) => {
            property.accept(this, parameters);
        });

        parameters.fileWriter.writeLine(0, '}\n');
        return null;
    }

    /**
     * Visitor design pattern
     * @param {EnumValueDeclaration} enumValueDeclaration - the object being visited
     * @param {Object} parameters - the parameter
     * @return {Object} the result of visiting or null
     * @private
     */
    visitEnumValueDeclaration(enumValueDeclaration, parameters) {
        console.log('entering visitEnumValueDeclaration', enumValueDeclaration.getName());
        const name = enumValueDeclaration.getName();
        parameters.fileWriter.writeLine(1, `${name},`);
        return null;
    }

    /**
     * Visitor design pattern
     * @param {RelationshipDeclaration} relationshipDeclaration - the object being visited
     * @param {Object} parameters - the parameter
     * @return {Object} the result of visiting or null
     * @private
     */
    visitRelationshipDeclaration(relationshipDeclaration, parameters) {
        console.log('entering visitRelationship', relationshipDeclaration.getName());
        let type = relationshipDeclaration.type

        if (relationshipDeclaration.isArray?.()) {
            type = `Vec<${type}>`
        }

        if (relationshipDeclaration.isOptional?.()) {
            type = `Option<${type}>`
        }

        parameters.fileWriter.writeLine(1, `#[serde(rename = "${relationshipDeclaration.name}")]`);
        parameters.fileWriter.writeLine(1, `pub ${this.toValidRustName(relationshipDeclaration.name.replace('$', ''))}: ${type},`);
        return null;
    }

    toRustType(type) {
        switch (type) {
            case 'DateTime':
                return 'DateTime<Utc>';
            case 'Boolean':
                return 'bool';
            case 'Long':
                return 'u64'
            case 'Double':
                return 'f64'
            default: {
                return type;
            }
        }
    }

    isDateField(type) {
        return type === 'DateTime'
    }

    addUtilsModelFile(parameters) {
        parameters.fileWriter.openFile('utils.rs');
        parameters.fileWriter.writeLine(0, 'use chrono::{ DateTime, TimeZone, Utc };')
        parameters.fileWriter.writeLine(0, 'use serde::{ Deserialize, Serialize, Deserializer, Serializer };');
        parameters.fileWriter.writeLine(1, '');
        parameters.fileWriter.writeLine(0, 'pub fn serialize_datetime_option<S>(datetime: &Option<chrono::DateTime<Utc>>, serializer: S) -> Result<S::Ok, S::Error>')
        parameters.fileWriter.writeLine(0, 'where')
        parameters.fileWriter.writeLine(1, 'S: Serializer,')
        parameters.fileWriter.writeLine(0, '{')
        parameters.fileWriter.writeLine(1, 'match datetime {')
        parameters.fileWriter.writeLine(2, 'Some(dt) => {')
        parameters.fileWriter.writeLine(3, 'serialize_datetime(&dt, serializer)')
        parameters.fileWriter.writeLine(2, '},')
        parameters.fileWriter.writeLine(2, '_ => unreachable!(),')
        parameters.fileWriter.writeLine(1, '}')
        parameters.fileWriter.writeLine(0, '}')
        parameters.fileWriter.writeLine(0, '')
        parameters.fileWriter.writeLine(0, "pub fn deserialize_datetime_option<'de, D>(deserializer: D) -> Result<Option<chrono::DateTime<Utc>>, D::Error>")
        parameters.fileWriter.writeLine(0, 'where')
        parameters.fileWriter.writeLine(1, "D: Deserializer<'de>,")
        parameters.fileWriter.writeLine(0, '{')
        parameters.fileWriter.writeLine(1, 'match deserialize_datetime(deserializer) {')
        parameters.fileWriter.writeLine(2, 'Ok(result)=>Ok(Some(result)),')
        parameters.fileWriter.writeLine(2, 'Err(error) => Err(error),')
        parameters.fileWriter.writeLine(1, '}')
        parameters.fileWriter.writeLine(0, '}')
        parameters.fileWriter.writeLine(0, '')
        parameters.fileWriter.writeLine(0, "pub fn deserialize_datetime<'de, D>(deserializer: D) -> Result<chrono::DateTime<Utc>, D::Error>")
        parameters.fileWriter.writeLine(0, 'where')
        parameters.fileWriter.writeLine(1, "D: Deserializer<'de>,")
        parameters.fileWriter.writeLine(0, '{')
        parameters.fileWriter.writeLine(1, 'let datetime_str = String::deserialize(deserializer)?;')
        parameters.fileWriter.writeLine(1, 'Utc.datetime_from_str(&datetime_str, "%Y-%m-%dT%H:%M:%S%.3fZ").map_err(serde::de::Error::custom)')
        parameters.fileWriter.writeLine(0, '}')
        parameters.fileWriter.writeLine(1, '');
        parameters.fileWriter.writeLine(0, 'pub fn serialize_datetime<S>(datetime: &chrono::DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>')
        parameters.fileWriter.writeLine(0, 'where')
        parameters.fileWriter.writeLine(1, 'S: Serializer,')
        parameters.fileWriter.writeLine(0, '{')
        parameters.fileWriter.writeLine(1, 'let datetime_str = datetime.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();')
        parameters.fileWriter.writeLine(1, 'serializer.serialize_str(&datetime_str)')
        parameters.fileWriter.writeLine(0, '}')
        parameters.fileWriter.closeFile()
    }
}

module.exports = RustVisitor;