import React, { useState, useEffect } from 'react';
import { Upload, Download, Trash2, FileText, Film, Archive, Image as ImageIcon, File } from 'lucide-react';
import { uploadProjectFile, downloadProjectFile, getProjectFileUrl } from '../services/storageService';

interface ProjectFilesManagerProps {
    projectId: string;
    projectName: string;
}

type FileType = 'srt' | 'script' | 'csv' | 'prompts' | 'video' | 'zip' | 'thumbnail';

const FILE_CONFIGS: Record<FileType, { label: string; icon: any; accept: string }> = {
    srt: { label: 'Arquivo SRT', icon: FileText, accept: '.srt' },
    script: { label: 'Script', icon: FileText, accept: '.txt' },
    csv: { label: 'CSV', icon: FileText, accept: '.csv' },
    prompts: { label: 'Prompts', icon: FileText, accept: '.txt' },
    video: { label: 'Vídeo Final', icon: Film, accept: '.mp4,.mov' },
    zip: { label: 'ZIP de Imagens', icon: Archive, accept: '.zip' },
    thumbnail: { label: 'Thumbnail', icon: ImageIcon, accept: '.jpg,.png,.webp' },
};

export const ProjectFilesManager: React.FC<ProjectFilesManagerProps> = ({ projectId, projectName }) => {
    const [fileUrls, setFileUrls] = useState<Record<string, string | null>>({});
    const [uploading, setUploading] = useState<string | null>(null);

    useEffect(() => {
        loadFileUrls();
    }, [projectId]);

    const loadFileUrls = async () => {
        const urls: Record<string, string | null> = {};
        for (const type of Object.keys(FILE_CONFIGS)) {
            urls[type] = await getProjectFileUrl(projectId, type as FileType);
        }
        setFileUrls(urls);
    };

    const handleUpload = async (type: FileType, file: File) => {
        setUploading(type);
        try {
            const url = await uploadProjectFile(projectId, file, type);
            setFileUrls({ ...fileUrls, [type]: url });
            alert(`${FILE_CONFIGS[type].label} enviado com sucesso!`);
        } catch (error) {
            alert(`Erro ao enviar ${FILE_CONFIGS[type].label}`);
        } finally {
            setUploading(null);
        }
    };

    const handleDownload = async (type: FileType) => {
        try {
            const blob = await downloadProjectFile(projectId, type);
            if (!blob) {
                alert('Arquivo não encontrado');
                return;
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${projectName}_${type}${FILE_CONFIGS[type].accept.split(',')[0]}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            alert('Erro ao baixar arquivo');
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="text-lg font-black uppercase text-slate-300">Arquivos do Projeto</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(Object.keys(FILE_CONFIGS) as FileType[]).map((type) => {
                    const config = FILE_CONFIGS[type];
                    const Icon = config.icon;
                    const hasFile = !!fileUrls[type];
                    const isUploading = uploading === type;

                    return (
                        <div
                            key={type}
                            className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-all"
                        >
                            <div className="flex items-center gap-3 mb-3">
                                <div className="p-2 bg-slate-800 rounded-lg">
                                    <Icon size={20} className="text-brand-400" />
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-sm font-bold text-white">{config.label}</h4>
                                    <p className="text-xs text-slate-500">
                                        {hasFile ? 'Arquivo enviado' : 'Nenhum arquivo'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <label className="flex-1">
                                    <input
                                        type="file"
                                        accept={config.accept}
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) handleUpload(type, file);
                                        }}
                                        disabled={isUploading}
                                        className="hidden"
                                    />
                                    <div className="w-full bg-brand-600 hover:bg-brand-500 disabled:bg-slate-700 text-white px-4 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all">
                                        <Upload size={14} />
                                        {isUploading ? 'Enviando...' : hasFile ? 'Substituir' : 'Enviar'}
                                    </div>
                                </label>

                                {hasFile && (
                                    <button
                                        onClick={() => handleDownload(type)}
                                        className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"
                                    >
                                        <Download size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <p className="text-xs text-slate-500">
                    💡 <strong>Dica:</strong> Todos os arquivos são armazenados de forma segura no Supabase Storage e podem ser baixados a qualquer momento.
                </p>
            </div>
        </div>
    );
};
