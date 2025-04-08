from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional
import pandas as pd
from fastapi.responses import StreamingResponse, JSONResponse
import io

# Database Setup
DATABASE_URL = "sqlite:///./scans.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# SQLAlchemy Model
class ScanDB(Base):
    __tablename__ = "scans"

    id = Column(Integer, primary_key=True, index=True)
    barcode = Column(String, index=True)
    scanned_at = Column(DateTime, default=datetime.utcnow)

# Pydantic Schemas
class ScanBase(BaseModel):
    barcode: str

class ScanCreate(ScanBase):
    pass

class Scan(ScanBase):
    id: int
    scanned_at: datetime

    class Config:
        orm_mode = True # Changed from from_attributes=True for compatibility

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Barcode Scan API")

# --- CORS Middleware ---
# Allow requests from the frontend development server
origins = [
    "http://localhost:3000", # Next.js default dev port
    # Add other origins if needed (e.g., deployed frontend URL)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins
    allow_credentials=True,
    allow_methods=["*"], # Allow all methods (GET, POST, etc.)
    allow_headers=["*"], # Allow all headers
)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- API Endpoints ---

@app.post("/scans/", response_model=Scan, status_code=201)
def create_scan(scan: ScanCreate, db: Session = Depends(get_db)):
    """
    Receives and stores a new barcode scan.
    """
    db_scan = ScanDB(**scan.model_dump(), scanned_at=datetime.utcnow())
    db.add(db_scan)
    db.commit()
    db.refresh(db_scan)
    return db_scan

@app.get("/scans/", response_model=List[Scan])
def read_scans(
    skip: int = 0,
    limit: int = 100,
    start_date: Optional[datetime] = Query(None, description="Filter scans from this date (inclusive). Format: YYYY-MM-DDTHH:MM:SS"),
    end_date: Optional[datetime] = Query(None, description="Filter scans up to this date (exclusive). Format: YYYY-MM-DDTHH:MM:SS"),
    barcode_query: Optional[str] = Query(None, alias="barcode", description="Filter scans by barcode content (partial match)"),
    db: Session = Depends(get_db)
):
    """
    Retrieves a list of scans, with optional filtering by date range and barcode content.
    """
    query = db.query(ScanDB)
    if start_date:
        query = query.filter(ScanDB.scanned_at >= start_date)
    if end_date:
        query = query.filter(ScanDB.scanned_at < end_date)
    if barcode_query:
        query = query.filter(ScanDB.barcode.contains(barcode_query)) # Use contains for partial match

    scans = query.order_by(ScanDB.scanned_at.desc()).offset(skip).limit(limit).all()
    return scans

@app.get("/scans/export/", response_class=StreamingResponse)
def export_scans(
    start_date: Optional[datetime] = Query(None, description="Filter scans from this date (inclusive). Format: YYYY-MM-DDTHH:MM:SS"),
    end_date: Optional[datetime] = Query(None, description="Filter scans up to this date (exclusive). Format: YYYY-MM-DDTHH:MM:SS"),
    barcode_query: Optional[str] = Query(None, alias="barcode", description="Filter scans by barcode content (partial match)"),
    db: Session = Depends(get_db)
):
    """
    Exports filtered scan data to an Excel file.
    """
    query = db.query(ScanDB)
    if start_date:
        query = query.filter(ScanDB.scanned_at >= start_date)
    if end_date:
        query = query.filter(ScanDB.scanned_at < end_date)
    if barcode_query:
        query = query.filter(ScanDB.barcode.contains(barcode_query))

    scans_data = query.order_by(ScanDB.scanned_at.desc()).all()

    if not scans_data:
        raise HTTPException(status_code=404, detail="No scans found for the given criteria.")

    # Convert SQLAlchemy objects to list of dicts for pandas
    data_for_df = [{"id": s.id, "barcode": s.barcode, "scanned_at": s.scanned_at} for s in scans_data]
    df = pd.DataFrame(data_for_df)

    # Format datetime for Excel readability
    if not df.empty:
        df['scanned_at'] = df['scanned_at'].dt.strftime('%Y-%m-%d %H:%M:%S')

    # Create Excel file in memory
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Scans')
    output.seek(0)

    headers = {
        'Content-Disposition': 'attachment; filename="scans_export.xlsx"'
    }
    return StreamingResponse(output, headers=headers, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

@app.delete("/scans/", status_code=200)
def delete_all_scans(db: Session = Depends(get_db)):
    """
    Deletes all scan records from the database.
    """
    try:
        num_deleted = db.query(ScanDB).delete()
        db.commit()
        return JSONResponse(content={"message": f"Successfully deleted {num_deleted} scan records."}, status_code=200)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete records: {str(e)}")


# Add a simple root endpoint for health check or basic info
@app.get("/")
def read_root():
    return {"message": "Barcode Scan API is running"}

# --- Uvicorn runner (for local development) ---
if __name__ == "__main__":
    import uvicorn
    # Ensure tables are created before starting the server when run directly
    Base.metadata.create_all(bind=engine)
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)