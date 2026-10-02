import * as FileSystem from 'expo-file-system/legacy';

export type VaultConfig = {
  dailyDirectoryUri?: string;
  templateFileUri?: string;
  dailyFolderLabel?: string;
};

export type VaultWriteResult = {
  uri: string;
  fileName: string;
  created: boolean;
};

const SAF = FileSystem.StorageAccessFramework;

export async function requestDailyFolder(): Promise<string | null> {
  const result = await SAF.requestDirectoryPermissionsAsync();
  return result.granted ? result.directoryUri : null;
}

export async function requestTemplateFile(): Promise<string | null> {
  // DocumentPicker returns a content URI that remains readable after the user grants access.
  const DocumentPicker = await import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/markdown', 'text/plain', '*/*'],
    copyToCacheDirectory: false,
    multiple: false,
  });
  return result.canceled ? null : result.assets[0]?.uri ?? null;
}

async function findDailyFile(directoryUri: string, fileName: string): Promise<string | null> {
  const entries = await SAF.readDirectoryAsync(directoryUri);
  const match = entries.find((uri) => decodeURIComponent(uri).toLowerCase().endsWith(`/${fileName.toLowerCase()}`));
  return match ?? null;
}

async function makeFromTemplate(directoryUri: string, fileName: string, templateUri?: string): Promise<string> {
  let contents = '---\n---\n';
  if (templateUri) {
    try {
      contents = await FileSystem.readAsStringAsync(templateUri);
    } catch {
      // A revoked template permission should not prevent a new empty daily note.
    }
  }
  const uri = await SAF.createFileAsync(directoryUri, fileName, 'text/markdown');
  await FileSystem.writeAsStringAsync(uri, contents);
  return uri;
}

function upsertFinanceYaml(markdown: string, operation: Record<string, unknown>): string {
  const normalized = markdown.replace(/^\uFEFF/, '');
  const key = /^finance_operations:\s*(.*)$/m;
  const found = normalized.match(key);
  let operations: Record<string, unknown>[] = [];
  if (found?.[1]) {
    try {
      const parsed = JSON.parse(found[1]);
      if (Array.isArray(parsed)) operations = parsed;
    } catch {
      // Keep a malformed existing field untouched by starting a clean list.
    }
  }
  operations.push(operation);
  const operationLine = `finance_operations: ${JSON.stringify(operations)}`;
  if (!normalized.startsWith('---')) {
    return `---\n${operationLine}\n---\n${normalized}`;
  }
  const close = normalized.indexOf('\n---', 3);
  if (close === -1) return `---\n${operationLine}\n---\n${normalized}`;
  const frontmatter = normalized.slice(0, close);
  const body = normalized.slice(close + 4);
  const updated = key.test(frontmatter)
    ? frontmatter.replace(key, operationLine)
    : `${frontmatter}\n${operationLine}`;
  return `${updated}\n---${body}`;
}

export async function writeOperationToDailyNote(
  config: VaultConfig,
  date: string,
  operation: Record<string, unknown>,
): Promise<VaultWriteResult> {
  if (!config.dailyDirectoryUri) throw new Error('Не выбрана папка ежедневных заметок.');
  const fileName = `${date}.md`;
  let uri = await findDailyFile(config.dailyDirectoryUri, fileName);
  let created = false;
  if (!uri) {
    uri = await makeFromTemplate(config.dailyDirectoryUri, fileName, config.templateFileUri);
    created = true;
  }
  const contents = await FileSystem.readAsStringAsync(uri);
  const next = upsertFinanceYaml(contents, operation);
  await FileSystem.writeAsStringAsync(uri, next);
  return { uri, fileName, created };
}

export async function testVaultAccess(config: VaultConfig): Promise<boolean> {
  if (!config.dailyDirectoryUri) return false;
  await SAF.readDirectoryAsync(config.dailyDirectoryUri);
  return true;
}
