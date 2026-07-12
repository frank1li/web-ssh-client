## ADDED Requirements

### Requirement: Context menu upload uploads to the right-clicked directory
When the user right-clicks a directory in the file tree and selects "Upload", the uploaded file SHALL be written to that directory on the remote server.

#### Scenario: Upload to right-clicked directory
- **WHEN** user right-clicks directory `/home/jianqli/` in the file tree
- **AND** selects "Upload" from the context menu
- **AND** picks file `test.cpp` from the file picker
- **THEN** the file SHALL be uploaded to `/home/jianqli/test.cpp`

### Requirement: Context menu download downloads the right-clicked file
When the user right-clicks a file in the file tree and selects "Download", the file SHALL be downloaded to the browser.

#### Scenario: Download file via context menu
- **WHEN** user right-clicks a file node in the file tree
- **AND** selects "Download" from the context menu
- **THEN** the browser SHALL download the file content

### Requirement: Context menu mkdir creates directory under the right-clicked directory
When the user right-clicks a directory in the file tree and selects "New Folder", the new directory SHALL be created under that directory.

#### Scenario: Create folder via context menu
- **WHEN** user right-clicks directory `/home/jianqli/` in the file tree
- **AND** selects "New Folder" from the context menu
- **AND** enters folder name `projects`
- **THEN** directory `/home/jianqli/projects` SHALL be created on the remote server

### Requirement: Context menu delete deletes the right-clicked item
When the user right-clicks a file or directory and selects "Delete", the item at that path SHALL be deleted from the remote server.

#### Scenario: Delete file via context menu
- **WHEN** user right-clicks file `/home/jianqli/test.cpp` in the file tree
- **AND** selects "Delete" from the context menu
- **AND** confirms the deletion prompt
- **THEN** file `/home/jianqli/test.cpp` SHALL be deleted from the remote server

### Requirement: Context menu rename renames the right-clicked file
When the user right-clicks a file and selects "Rename", the file SHALL be renamed on the remote server.

#### Scenario: Rename file via context menu
- **WHEN** user right-clicks file `/home/jianqli/test.cpp` in the file tree
- **AND** selects "Rename" from the context menu
- **AND** enters new name `prod.cpp`
- **THEN** the remote file SHALL be renamed from `/home/jianqli/test.cpp` to `/home/jianqli/prod.cpp`

### Requirement: File list toolbar has a Download button
The file list toolbar SHALL have a "Download" button that downloads the currently selected file.

#### Scenario: Download button downloads selected file
- **WHEN** user clicks a file named `readme.md` in the file list at path `/home/jianqli/`
- **AND** clicks the "Download" button in the toolbar
- **THEN** the browser SHALL download the file from `/home/jianqli/readme.md`

### Requirement: File list toolbar Upload button uploads to current directory
The Upload button in the file list toolbar SHALL upload the selected file to the currently displayed directory.

#### Scenario: Upload via toolbar button
- **WHEN** the file list is showing directory `/home/jianqli/`
- **AND** user clicks the "Upload" button in the toolbar
- **AND** picks file `notes.txt` from the file picker
- **THEN** the file SHALL be uploaded to `/home/jianqli/notes.txt`
