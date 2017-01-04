/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * @flow
 */

import type {DefinitionProvider} from '../../nuclide-definition-service';
import type {FindReferencesProvider} from '../../nuclide-find-references';
import type {LinterProvider} from '../../nuclide-diagnostics-common';
import typeof * as PythonService from '../../nuclide-python-rpc/lib/PythonService';
import type {ServerConnection} from '../../nuclide-remote-connection';
import type {
  AtomLanguageServiceConfig,
} from '../../nuclide-language-service/lib/AtomLanguageService';
import type {LanguageService} from '../../nuclide-language-service/lib/LanguageService';

import invariant from 'assert';
// eslint-disable-next-line nuclide-internal/no-cross-atom-imports
import {DedupedBusySignalProviderBase} from '../../nuclide-busy-signal';
import {GRAMMARS, GRAMMAR_SET} from './constants';
import {getLintOnFly} from './config';
import AutocompleteHelpers from './AutocompleteHelpers';
import DefinitionHelpers from './DefinitionHelpers';
import ReferenceHelpers from './ReferenceHelpers';
import LintHelpers from './LintHelpers';
import {getServiceByConnection} from '../../nuclide-remote-connection';
import {getNotifierByConnection} from '../../nuclide-open-files';
import {AtomLanguageService} from '../../nuclide-language-service';
import {getShowGlobalVariables} from './config';

const PYTHON_SERVICE_NAME = 'PythonService';

let busySignalProvider: ?DedupedBusySignalProviderBase = null;

async function connectionToPythonService(
  connection: ?ServerConnection,
): Promise<LanguageService> {
  const pythonService: PythonService = getServiceByConnection(PYTHON_SERVICE_NAME, connection);
  const fileNotifier = await getNotifierByConnection(connection);
  const languageService = await pythonService.initialize(
    fileNotifier,
    getShowGlobalVariables(),
  );

  return languageService;
}

const atomConfig: AtomLanguageServiceConfig = {
  name: 'Python',
  grammars: GRAMMARS,
  outlines: {
    version: '0.0.0',
    priority: 1,
    analyticsEventName: 'python.outline',
  },
  codeFormat: {
    version: '0.0.0',
    priority: 1,
    analyticsEventName: 'python.formatCode',
    formatEntireFile: true,
  },
};

let pythonLanguageService: ?AtomLanguageService<LanguageService> = null;

export function activate() {
  busySignalProvider = new DedupedBusySignalProviderBase();
  if (pythonLanguageService == null) {
    pythonLanguageService = new AtomLanguageService(connectionToPythonService, atomConfig);
    pythonLanguageService.activate();
  }
}


export function createAutocompleteProvider(): atom$AutocompleteProvider {
  return {
    selector: '.source.python',
    disableForSelector: '.source.python .comment, .source.python .string',
    inclusionPriority: 5,
    suggestionPriority: 5,  // Higher than the snippets provider.
    getSuggestions(request) {
      return AutocompleteHelpers.getAutocompleteSuggestions(request);
    },
  };
}

export function provideDefinitions(): DefinitionProvider {
  return {
    grammarScopes: Array.from(GRAMMAR_SET),
    priority: 20,
    name: 'PythonDefinitionProvider',
    getDefinition(editor, position) {
      return DefinitionHelpers.getDefinition(editor, position);
    },
    getDefinitionById(filePath, id) {
      return DefinitionHelpers.getDefinitionById(filePath, id);
    },
  };
}

export function provideReferences(): FindReferencesProvider {
  return {
    async isEditorSupported(textEditor) {
      const fileUri = textEditor.getPath();
      if (!fileUri || !GRAMMAR_SET.has(textEditor.getGrammar().scopeName)) {
        return false;
      }
      return true;
    },
    findReferences(editor, position) {
      return ReferenceHelpers.getReferences(editor, position);
    },
  };
}

export function provideLint(): LinterProvider {
  return {
    grammarScopes: Array.from(GRAMMAR_SET),
    scope: 'file',
    lintOnFly: getLintOnFly(),
    name: 'nuclide-python',
    invalidateOnClose: true,
    lint(editor) {
      invariant(busySignalProvider);
      return busySignalProvider.reportBusy(
        `Python: Waiting for flake8 lint results for \`${editor.getTitle()}\``,
        () => LintHelpers.lint(editor),
      );
    },
  };
}

export function provideBusySignal(): DedupedBusySignalProviderBase {
  invariant(busySignalProvider);
  return busySignalProvider;
}

export function deactivate() {
  if (pythonLanguageService != null) {
    pythonLanguageService.dispose();
    pythonLanguageService = null;
  }
}
