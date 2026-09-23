export function getLanguageFromPath(path: string): string {
  if (!path) return 'plaintext'
  const ext = path.split('.').pop()?.toLowerCase()
  
  switch (ext) {
    case 'js':
    case 'jsx':
      return 'javascript'
    case 'ts':
    case 'tsx':
      return 'typescript'
    case 'json':
      return 'json'
    case 'html':
      return 'html'
    case 'css':
      return 'css'
    case 'md':
      return 'markdown'
    case 'py':
      return 'python'
    case 'java':
      return 'java'
    case 'c':
    case 'cpp':
    case 'h':
    case 'hpp':
      return 'cpp'
    case 'cs':
      return 'csharp'
    case 'go':
      return 'go'
    case 'rs':
      return 'rust'
    case 'sql':
      return 'sql'
    case 'sh':
      return 'shell'
    case 'yaml':
    case 'yml':
      return 'yaml'
    case 'xml':
      return 'xml'
    default:
      return 'plaintext'
  }
}
