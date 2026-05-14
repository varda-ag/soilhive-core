export function downloadFile(url: string, filename?: string) {
  const link = document.createElement('a');
  link.href = url;
  if (filename) {
    link.download = filename;
  }

  document.body.appendChild(link);
  link.click();
  link.remove();
}
