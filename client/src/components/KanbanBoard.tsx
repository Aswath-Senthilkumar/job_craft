import { useState } from "react";
import { DragDropContext, Droppable, DropResult } from "@hello-pangea/dnd";
import { Job, JobStatus, COLUMNS } from "../types";
import JobCard from "./JobCard";

interface Props {
  jobs: Job[];
  onDragEnd: (jobId: number, newStatus: JobStatus) => void;
  onCardClick: (job: Job) => void;
  selectionMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onDeleteColumn: (status: JobStatus, count: number) => void;
  onSelectAllInColumn?: (status: JobStatus) => void;
}

export default function KanbanBoard({
  jobs,
  onDragEnd,
  onCardClick,
  selectionMode,
  selectedIds,
  onToggleSelect,
  onDeleteColumn,
  onSelectAllInColumn,
}: Props) {
  const [hoveredCol, setHoveredCol] = useState<JobStatus | null>(null);

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const jobId = parseInt(result.draggableId);
    const newStatus = result.destination.droppableId as JobStatus;
    if (result.source.droppableId === newStatus && result.source.index === result.destination.index) return;
    onDragEnd(jobId, newStatus);
  }

  function getJobsByStatus(status: JobStatus) {
    return jobs.filter((j) => j.status === status);
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-2 overflow-x-auto px-3 pb-3 h-full">
        {COLUMNS.map((col) => {
          const columnJobs = getJobsByStatus(col.id);
          return (
            <div
              key={col.id}
              className="flex flex-col flex-1 min-w-[220px] h-full"
              onMouseEnter={() => setHoveredCol(col.id)}
              onMouseLeave={() => setHoveredCol(null)}
            >
              {/* Column Header */}
              <div className={`px-4 py-3 rounded-t-xl bg-gradient-to-b ${col.gradient} border border-b-0 border-gray-800/50`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${col.dotColor}`} />
                    <h2 className="font-semibold text-base text-gray-200">
                      {col.emoji} {col.title}
                    </h2>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-base font-medium px-2.5 py-0.5 rounded-full ${col.countBg}`}>
                      {columnJobs.length}
                    </span>
                    {/* Select all in column — shown in selection mode for any column with jobs */}
                    {selectionMode && columnJobs.length > 0 && onSelectAllInColumn && (
                      (() => {
                        const allSelected = columnJobs.every((j) => selectedIds.has(j.id));
                        return (
                          <button
                            onClick={() => onSelectAllInColumn(col.id)}
                            title={allSelected ? `Deselect all in ${col.title}` : `Select all ${columnJobs.length} in ${col.title}`}
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                              allSelected
                                ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                                : "bg-gray-700/30 text-gray-500 hover:bg-gray-700/50 hover:text-gray-300"
                            }`}
                          >
                            {allSelected ? "Deselect" : "All"}
                          </button>
                        );
                      })()
                    )}
                    {/* Delete all in column — only for rejected column, visible on hover */}
                    {col.id === "rejected" && columnJobs.length > 0 && hoveredCol === col.id && (
                      <button
                        onClick={() => onDeleteColumn(col.id, columnJobs.length)}
                        title={`Delete all ${columnJobs.length} jobs in ${col.title}`}
                        className="w-5 h-5 flex items-center justify-center rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Droppable Area */}
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 overflow-y-auto px-1.5 py-2 space-y-2 min-h-[120px] rounded-b-xl border border-t-0 transition-all duration-200
                      ${snapshot.isDraggingOver
                        ? "border-gray-700/80 bg-gray-800/15"
                        : "border-gray-800/40 bg-[#0a0b0e]/50"
                      }
                    `}
                  >
                    {columnJobs.length === 0 && !snapshot.isDraggingOver && (
                      <div className="flex flex-col items-center justify-center h-20 text-gray-700 text-xs text-center gap-1">
                        <span>Drop jobs here</span>
                        {col.id === "filtered" && (
                          <span className="text-[10px] text-gray-800">Run pipeline to auto-populate</span>
                        )}
                      </div>
                    )}
                    {columnJobs.map((job, index) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        index={index}
                        column={col}
                        onClick={onCardClick}
                        selectionMode={selectionMode}
                        isSelected={selectedIds.has(job.id)}
                        onToggleSelect={onToggleSelect}
                      />
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
