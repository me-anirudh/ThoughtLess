export function buildFolderTree(files: { path: string; name: string; isFolder: boolean }[]) {
  const root: any = { name: 'root', isFolder: true, children: [] }

  files.forEach((file) => {
    const parts = file.path.split('/').filter(Boolean)
    let current = root

    parts.forEach((part, index) => {
      let existingPath = current.children.find((c: any) => c.name === part)

      if (!existingPath) {
        existingPath = {
          name: part,
          path: parts.slice(0, index + 1).join('/'),
          isFolder: index < parts.length - 1 || Boolean(file.isFolder),
          children: []
        }
        current.children.push(existingPath)
      }
      current = existingPath
    })
  })

  function sortNodes(nodes: any[]): any[] {
    nodes.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1
      if (!a.isFolder && b.isFolder) return 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    nodes.forEach((node) => {
      if (node.children && node.children.length > 0) {
        sortNodes(node.children)
      }
    })
    return nodes
  }

  return sortNodes(root.children)
}
