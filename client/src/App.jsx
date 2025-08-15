import { useState } from 'react';

function App() {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [uploadData, setUploadData] = useState(null);

  const onFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setMessage('Please select a file to upload.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        setMessage(`File uploaded successfully: ${data.path}`);
        setUploadData(data.data);
      } else {
        setMessage(`Error uploading file: ${data.message}`);
      }
    } catch (error) {
      setMessage(`Error uploading file: ${error.message}`);
    }
  };

  return (
    <div>
      <h1>File Upload</h1>
      <form onSubmit={onSubmit}>
        <input type="file" onChange={onFileChange} />
        <button type="submit">Upload</button>
      </form>
      {message && <p>{message}</p>}
      {uploadData && (
        <div>
          <h2>Upload Details:</h2>
          <pre>{JSON.stringify(uploadData, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default App;
