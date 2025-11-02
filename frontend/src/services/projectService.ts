import axios from 'axios';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export interface ProjectFile {
  path: string;
  content: string;
  type: 'file' | 'folder';
  createdAt: string;
  updatedAt: string;
}

export interface ProjectStep {
  id: number;
  title: string;
  description: string;
  type: string;
  status: 'pending' | 'completed' | 'failed';
  code?: string;
  path?: string;
  createdAt: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Project {
  _id: string;
  id: string;
  name: string;
  description?: string;
  prompt: string;
  aiProvider: 'claude' | 'nvidia';
  template: string;
  files: ProjectFile[];
  steps: ProjectStep[];
  conversation: ConversationMessage[];
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
}

export interface CreateProjectData {
  name: string;
  description?: string;
  prompt: string;
  aiProvider: 'claude' | 'nvidia';
  template: string;
}

export interface ProjectsResponse {
  success: boolean;
  projects: Project[];
  pagination: {
    current: number;
    total: number;
    count: number;
    totalItems: number;
  };
}

export interface ProjectResponse {
  success: boolean;
  project: Project;
}

export const projectService = {
  // Create a new project
  async createProject(data: CreateProjectData): Promise<ProjectResponse> {
    const response = await axios.post(`${BACKEND_URL}/api/projects`, data);
    return response.data;
  },

  // Get all projects
  async getProjects(status?: string, page: number = 1, limit: number = 20): Promise<ProjectsResponse> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    params.append('page', page.toString());
    params.append('limit', limit.toString());

    const response = await axios.get(`${BACKEND_URL}/api/projects?${params}`);
    return response.data;
  },

  // Get a specific project
  async getProject(id: string): Promise<ProjectResponse> {
    const response = await axios.get(`${BACKEND_URL}/api/projects/${id}`);
    return response.data;
  },

  // Update project
  async updateProject(id: string, data: Partial<Project>): Promise<ProjectResponse> {
    const response = await axios.put(`${BACKEND_URL}/api/projects/${id}`, data);
    return response.data;
  },

  // Delete project
  async deleteProject(id: string): Promise<{ success: boolean; message: string }> {
    const response = await axios.delete(`${BACKEND_URL}/api/projects/${id}`);
    return response.data;
  },

  // Add file to project
  async addFileToProject(id: string, file: { path: string; content: string; type?: 'file' | 'folder' }) {
    const response = await axios.post(`${BACKEND_URL}/api/projects/${id}/files`, file);
    return response.data;
  },

  // Add conversation message
  async addConversationMessage(id: string, message: { role: 'user' | 'assistant'; content: string }) {
    const response = await axios.post(`${BACKEND_URL}/api/projects/${id}/conversation`, message);
    return response.data;
  },

  // Update project status
  async updateProjectStatus(id: string, status: 'active' | 'completed' | 'archived'): Promise<ProjectResponse> {
    return this.updateProject(id, { status });
  }
};