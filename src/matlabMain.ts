'use strict';

import vscode = require('vscode');
import cp = require('child_process');
import path = require('path');
import fs = require('fs');
import { check, ICheckResult } from './matlabDiagnostics';

import {commands, window, workspace, InputBoxOptions} from 'vscode';

var canLint = true;
let diagnosticCollection: vscode.DiagnosticCollection;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	console.log("Activating extension Matlab");

	var matlabConfig = workspace.getConfiguration('matlab');

	if (!matlabConfig['lintOnSave']) {
		return;
	}

	if (!matlabConfig.has('mlintpath') || matlabConfig['mlintpath'] == null) {
		window.showErrorMessage("Could not find path to the mlint executable in the configuration file.")
		return;
	}

	var mlintPath = matlabConfig['mlintpath'];

	if (!fs.existsSync(mlintPath)) {
		window.showErrorMessage("The cannot find mlint at the given path, please check your configuration file.")
		return;
	}

	diagnosticCollection = vscode.languages.createDiagnosticCollection("matlab");
	context.subscriptions.push(diagnosticCollection);

	context.subscriptions.push(startLintOnSaveWatcher(mlintPath));
}

function startLintOnSaveWatcher(mlintPath: string) {

	function mapSeverityToVSCodeSeverity(sev: string) {
		switch (sev) {
			case "error": return vscode.DiagnosticSeverity.Error;
			case "warning": return vscode.DiagnosticSeverity.Warning;
			default: return vscode.DiagnosticSeverity.Error;
		}
	}

	let matlabConfig = vscode.workspace.getConfiguration('matlab');

	return workspace.onDidSaveTextDocument(document => {
		if (document.languageId != "matlab") {
			return;
		}

		check(document.uri.fsPath, matlabConfig['lintOnSave'], mlintPath).then(errors => {
			diagnosticCollection.clear();

			let diagnosticMap: Map<vscode.Uri, vscode.Diagnostic[]> = new Map();;

			errors.forEach(error => {
				let targetUri = vscode.Uri.file(error.file);

				var line = error.line - 1;
				if (line < 0) line = 0;

				var startColumn = error.column[0] - 1;
				if (startColumn < 0) startColumn = 0;

				var endColumn = error.column[1] - 1;
				if (endColumn < 0) endColumn = 0;

				let range = new vscode.Range(line, startColumn, line, endColumn);
				let diagnostic = new vscode.Diagnostic(range, error.msg, mapSeverityToVSCodeSeverity(error.severity));

				let diagnostics = diagnosticMap.get(targetUri);
				if (!diagnostics) {
					diagnostics = [];
				}

				diagnostics.push(diagnostic);
				diagnosticMap.set(targetUri, diagnostics);
			});

			let entries: [vscode.Uri, vscode.Diagnostic[]][] = [];
			diagnosticMap.forEach((diags, uri) => {
				entries.push([uri, diags]);
			});

			diagnosticCollection.set(entries);
		}).catch(err => {
			vscode.window.showErrorMessage(err);
		});
	});
}