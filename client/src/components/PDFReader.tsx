import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Bookmark,
  BookmarkPlus,
  Upload,
  Search,
  Menu
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// Set up the worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface Bookmark {
  id: string;
  title: string;
  pageNumber: number;
  timestamp: number;
  file_id?: string;
}

interface PDFFile {
  id: string;
  title: string;
  filename: string;
  file_path: string;
  file_size: number;
  total_pages: number;
  upload_date: string;
}

interface PDFReaderProps {
  className?: string;
}

const PDFReader: React.FC<PDFReaderProps> = ({ className }) => {
  const [file, setFile] = useState<File | null>(null);
  const [currentPDFFile, setCurrentPDFFile] = useState<PDFFile | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [savedPDFs, setSavedPDFs] = useState<PDFFile[]>([]);
  const [showBookmarks, setShowBookmarks] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [bookmarkTitle, setBookmarkTitle] = useState<string>('');
  const [isFlipping, setIsFlipping] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved PDFs and bookmarks on component mount
  useEffect(() => {
    loadSavedPDFs();
    loadSamplePDF();
  }, []);

  // Load bookmarks when current PDF file changes
  useEffect(() => {
    if (currentPDFFile) {
      loadBookmarks(currentPDFFile.id);
    }
  }, [currentPDFFile]);

  const loadSavedPDFs = async () => {
    try {
      const { data, error } = await supabase
        .from('pdf_files')
        .select('*')
        .order('upload_date', { ascending: false });

      if (error) throw error;
      setSavedPDFs(data || []);
    } catch (error) {
      console.error('Error loading PDFs:', error);
      toast.error('Failed to load saved PDFs');
    }
  };

  const loadBookmarks = async (fileId: string) => {
    try {
      const { data, error } = await supabase
        .from('bookmarks')
        .select('*')
        .eq('file_id', fileId)
        .order('page_number');

      if (error) throw error;

      const formattedBookmarks: Bookmark[] = (data || []).map(bookmark => ({
        id: bookmark.id,
        title: bookmark.title,
        pageNumber: bookmark.page_number,
        timestamp: new Date(bookmark.timestamp).getTime(),
        file_id: bookmark.file_id
      }));

      setBookmarks(formattedBookmarks);
    } catch (error) {
      console.error('Error loading bookmarks:', error);
      toast.error('Failed to load bookmarks');
    }
  };

  const loadSamplePDF = async () => {
    try {
      // Load the sample PDF from public folder
      const pdfUrl = '/sample-pdfs/IPAS-BS-KLS-III.pdf';
      const response = await fetch(pdfUrl);

      if (response.ok) {
        const blob = await response.blob();
        const file = new File([blob], 'IPAS-BS-KLS-III.pdf', { type: 'application/pdf' });
        setFile(file);

        // Create a sample PDF file record if it doesn't exist
        const { data: existingFile } = await supabase
          .from('pdf_files')
          .select('*')
          .eq('filename', 'IPAS-BS-KLS-III.pdf')
          .single();

        if (!existingFile) {
          const { data: newPDFFile, error } = await supabase
            .from('pdf_files')
            .insert({
              title: 'IPAS untuk Siswa Kelas III',
              filename: 'IPAS-BS-KLS-III.pdf',
              file_path: pdfUrl,
              file_size: blob.size,
              total_pages: 0 // Will be updated when PDF loads
            })
            .select()
            .single();

          if (!error && newPDFFile) {
            setCurrentPDFFile(newPDFFile);
            setSavedPDFs(prev => [newPDFFile, ...prev]);
          }
        } else {
          setCurrentPDFFile(existingFile);
        }
      }
    } catch (error) {
      console.error('Error loading sample PDF:', error);
    }
  };

  const onDocumentLoadSuccess = async ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentPage(1);

    // Update total pages in database if we have a current PDF file
    if (currentPDFFile && currentPDFFile.total_pages === 0) {
      try {
        await supabase
          .from('pdf_files')
          .update({ total_pages: numPages })
          .eq('id', currentPDFFile.id);

        setCurrentPDFFile(prev => prev ? { ...prev, total_pages: numPages } : null);
      } catch (error) {
        console.error('Error updating page count:', error);
      }
    }

    toast.success(`PDF loaded successfully! ${numPages} pages found.`);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('Error loading PDF:', error);
    toast.error('Failed to load PDF file');
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (!uploadedFile || uploadedFile.type !== 'application/pdf') {
      toast.error('Please select a valid PDF file');
      return;
    }

    setLoading(true);
    try {
      // Upload file to Supabase Storage
      const fileName = `${Date.now()}-${uploadedFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('pdfs')
        .upload(`public/${fileName}`, uploadedFile);

      if (uploadError) throw uploadError;

      // Save PDF file info to database
      const { data: pdfFileData, error: dbError } = await supabase
        .from('pdf_files')
        .insert({
          title: uploadedFile.name.replace('.pdf', ''),
          filename: uploadedFile.name,
          file_path: uploadData.path,
          file_size: uploadedFile.size,
          total_pages: 0
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setFile(uploadedFile);
      setCurrentPDFFile(pdfFileData);
      setBookmarks([]);
      setSavedPDFs(prev => [pdfFileData, ...prev]);
      toast.success('PDF uploaded successfully!');
    } catch (error) {
      console.error('Error uploading PDF:', error);
      toast.error('Failed to upload PDF');
    } finally {
      setLoading(false);
    }
  };

  const changePage = (newPage: number) => {
    if (newPage >= 1 && newPage <= numPages) {
      setIsFlipping(true);
      setTimeout(() => {
        setCurrentPage(newPage);
        setIsFlipping(false);
      }, 150);
    }
  };

  const nextPage = () => changePage(currentPage + 1);
  const prevPage = () => changePage(currentPage - 1);

  const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 3.0));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));

  const addBookmark = async () => {
    if (!bookmarkTitle.trim()) {
      toast.error('Please enter a bookmark title');
      return;
    }

    if (!currentPDFFile) {
      toast.error('No PDF file selected');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('bookmarks')
        .insert({
          title: bookmarkTitle.trim(),
          page_number: currentPage,
          file_id: currentPDFFile.id,
          timestamp: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      const newBookmark: Bookmark = {
        id: data.id,
        title: data.title,
        pageNumber: data.page_number,
        timestamp: new Date(data.timestamp).getTime(),
        file_id: data.file_id || undefined
      };

      setBookmarks(prev => [...prev, newBookmark]);
      setBookmarkTitle('');
      toast.success('Bookmark added successfully!');
    } catch (error) {
      console.error('Error adding bookmark:', error);
      toast.error('Failed to add bookmark');
    }
  };

  const goToBookmark = (pageNumber: number) => {
    changePage(pageNumber);
    setShowBookmarks(false);
  };

  const removeBookmark = async (id: string) => {
    try {
      const { error } = await supabase
        .from('bookmarks')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setBookmarks(prev => prev.filter(bookmark => bookmark.id !== id));
      toast.success('Bookmark removed');
    } catch (error) {
      console.error('Error removing bookmark:', error);
      toast.error('Failed to remove bookmark');
    }
  };

  const filteredBookmarks = bookmarks.filter(bookmark =>
    bookmark.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={cn("flex h-screen bg-background", className)}>
      {/* Sidebar */}
      <div className={cn(
        "w-80 bg-card border-r border-border transition-transform duration-300 ease-in-out",
        showBookmarks ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4">PDF Reader</h2>

          {/* File Upload */}
          <div className="mb-4">
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
              variant="outline"
              disabled={loading}
            >
              <Upload className="w-4 h-4 mr-2" />
              {loading ? 'Uploading...' : 'Upload PDF'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {/* Add Bookmark */}
          {file && (
            <div className="space-y-2">
              <Input
                placeholder="Bookmark title"
                value={bookmarkTitle}
                onChange={(e) => setBookmarkTitle(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addBookmark()}
              />
              <Button onClick={addBookmark} className="w-full" size="sm">
                <BookmarkPlus className="w-4 h-4 mr-2" />
                Add Bookmark
              </Button>
            </div>
          )}
        </div>

        {/* Bookmarks List */}
        <div className="p-4">
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search bookmarks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <ScrollArea className="h-[calc(100vh-300px)]">
            <div className="space-y-2">
              {filteredBookmarks.map((bookmark) => (
                <div
                  key={bookmark.id}
                  className="group flex items-center justify-between p-3 rounded-lg bg-secondary/20 hover:bg-secondary/40 transition-colors cursor-pointer"
                  onClick={() => goToBookmark(bookmark.pageNumber)}
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm text-foreground truncate">
                      {bookmark.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Page {bookmark.pageNumber}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeBookmark(bookmark.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </Button>
                </div>
              ))}
              {filteredBookmarks.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  {bookmarks.length === 0 ? 'No bookmarks yet' : 'No matching bookmarks'}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-card border-b border-border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowBookmarks(!showBookmarks)}
                className="md:hidden"
              >
                <Menu className="w-4 h-4" />
              </Button>

              {file && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={prevPage}
                    disabled={currentPage <= 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>

                  <span className="text-sm font-medium px-3 py-1 bg-secondary rounded">
                    {currentPage} / {numPages}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={nextPage}
                    disabled={currentPage >= numPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            {file && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={zoomOut}>
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium px-2">
                  {Math.round(scale * 100)}%
                </span>
                <Button variant="outline" size="sm" onClick={zoomIn}>
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </header>

        {/* PDF Viewer */}
        <div className="flex-1 bg-muted/20 overflow-hidden">
          {file ? (
            <div className="h-full flex items-center justify-center">
              <div className={cn(
                "transition-all duration-300 ease-in-out",
                isFlipping ? "scale-95 opacity-50" : "scale-100 opacity-100"
              )}>
                <Document
                  file={file}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={onDocumentLoadError}
                  className="pdf-document"
                >
                  <div className="bg-white shadow-2xl rounded-lg overflow-hidden">
                    <Page
                      pageNumber={currentPage}
                      scale={scale}
                      className="pdf-page"
                    />
                  </div>
                </Document>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-24 h-24 bg-secondary rounded-full flex items-center justify-center mb-4 mx-auto">
                  <Upload className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No PDF Selected
                </h3>
                <p className="text-muted-foreground mb-4">
                  Upload a PDF file to start reading
                </p>
                <Button onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" />
                  Choose PDF File
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PDFReader;
