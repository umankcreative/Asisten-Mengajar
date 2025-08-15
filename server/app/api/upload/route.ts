import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export async function POST(req: NextRequest) {
  const data = await req.formData();
  const file: File | null = data.get('file') as unknown as File;

  if (!file) {
    return NextResponse.json({ success: false, message: 'No file uploaded' });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // With the file data in the buffer, you can do whatever you want with it.
  // For this example, we'll write it to the public directory.
  const path = join(process.cwd(), 'public/uploads', file.name);
  await writeFile(path, buffer);
  console.log(`open ${path} to see the uploaded file`);

  return NextResponse.json({ success: true, path: `/uploads/${file.name}` });
}
