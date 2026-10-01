# ThoughtLess 🧠

![ThoughtLess Banner](https://img.shields.io/badge/Status-Active-success) ![Next.js](https://img.shields.io/badge/Next.js-16.2.9-black?logo=next.js) ![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript) ![Prisma](https://img.shields.io/badge/Prisma-7.8-1B222D?logo=prisma)

**ThoughtLess** is a powerful, local-first web-based code editor and version control system (VCS). Built to handle complex branching, history tracking, and intelligent diffing, it allows developers to write, track, and visualize code changes entirely in the browser before seamlessly syncing them to a remote server.

---

## ✨ Features

- **Local-First Architecture:** Edits and drafts are saved instantly to your browser using IndexedDB (Dexie). Work entirely offline and sync when you're ready.
- **Adaptive Diff Engine:** A custom-built, multi-stage diff pipeline implementing **Myers, Patience, and Histogram** algorithms. It intelligently partitions files, selects the optimal algorithm, and generates standardized Unified Patches.
- **DAG-Based Version History:** Visualizes your commits as a Directed Acyclic Graph (DAG) using D3.js. Easily navigate branches, commits, and file states.
- **Smart Storage:** Employs a hybrid storage model alternating between `FullBlob` (complete file snapshots) and `DeltaBlob` (lightweight patches) to optimize database size and reconstruction speed.
- **Integrated Code Editor:** Powered by Monaco Editor, providing a rich, VS Code-like coding experience right in the browser.

---

## 🛠 Tech Stack

- **Framework:** Next.js (App Router, React 19)
- **Language:** TypeScript
- **Database:** PostgreSQL (via Prisma ORM)
- **Storage:** MinIO (S3-compatible Object Storage)
- **Local Storage:** IndexedDB (via Dexie.js)
- **Styling:** Tailwind CSS
- **State Management:** Zustand
- **Visualization:** D3.js

---

## 🚀 Quick Start (Docker)

The absolute easiest way to run ThoughtLess is using Docker. We have bundled the app, PostgreSQL database, and MinIO storage into a single Compose file.

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed on your machine.

### Running the App
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/thoughtless.git
   cd thoughtless
   ```

2. Spin up the entire environment:
   ```bash
   docker-compose up --build
   ```

3. Access the services:
   - **ThoughtLess App:** [http://localhost:3000](http://localhost:3000)
   - **MinIO Console:** [http://localhost:9001](http://localhost:9001) *(Login: `admin` / `password123`)*

*Note: The Docker setup automatically applies the Prisma database schemas on startup.*

---

## 💻 Local Development Setup (Manual)

If you prefer to run the services manually without Docker, follow these steps:

1. **Install Dependencies**
   ```bash
   npm install --legacy-peer-deps
   ```

2. **Environment Variables**
   Rename `.env.example` to `.env` (or create one) and configure your database and MinIO credentials:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/thoughtfull"
   MINIO_ENDPOINT=127.0.0.1
   MINIO_PORT=9000
   MINIO_ACCESS_KEY=your_access_key
   MINIO_SECRET_KEY=your_secret_key
   ```

3. **Database Migration**
   Push the Prisma schema to your PostgreSQL database:
   ```bash
   npx prisma db push
   ```

4. **Start the Development Server**
   ```bash
   npm run dev
   ```
   The app will be available at [http://localhost:3000](http://localhost:3000).

---

## 🏗 Architecture Spotlight: The Diff Engine

ThoughtLess doesn't just rely on standard Git binaries. It implements a complete, bespoke Diff Engine in TypeScript (`lib/diff-engine`). 

When a user commits a file:
1. The engine compares the draft with the last saved snapshot.
2. The **Partition Engine** breaks the file into stable blocks and changed regions.
3. The **Query Planner** routes different regions to the best algorithm (e.g., Myers for general text, Patience for repetitive code).
4. The output is serialized into a standard unified diff patch.
5. Depending on the depth of the commit chain, the system persists either a heavy `FullBlob` or a highly efficient `DeltaBlob`.

When historical files are viewed, ThoughtLess walks the DAG backwards to the nearest `FullBlob` and rapidly applies the `DeltaBlob` patches forward to perfectly reconstruct the file.

---

## 🧪 Testing

We use **Vitest** for our test suite, heavily focusing on adversarial round-trip testing of the Diff Engine to guarantee zero data loss.

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch
```

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
