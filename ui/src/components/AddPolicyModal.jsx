import React, { useState, useEffect, useRef } from 'react';
import styles from './AddPolicyModal.module.css';
import { IconX } from './Icons';
import { getPolicyIcon } from './ProxyDetail';
import { fetchPolicyMenu } from '../utils/fetchPolicyMenu';
import { getPolicyAcronym } from "../utils/format";

import AIIcon from '../../icons/AI.svg';
import ExtensionIcon from '../../icons/Extension.svg';

export const AddPolicyModal = ({ isOpen, onClose, onAdd, scripts = [] }) => {
	const [catalog, setCatalog] = useState({});
	const [selectedType, setSelectedType] = useState(null);
	const [formData, setFormData] = useState({ 
		displayName: '', 
		name: '', 
		scriptFile: '', 
		scriptAction: 'existing' 
	});
	const [searchTerm, setSearchTerm] = useState('');
	const [loading, setLoading] = useState(true);
	const [selectedImportedFile, setSelectedImportedFile] = useState(null);
	const fileInputRef = useRef(null);

	useEffect(() => {
		if (isOpen) {
			setLoading(true);
			fetchPolicyMenu().then(data => {
				if (data) setCatalog(data);
				setLoading(false);
			});
		}
	}, [isOpen]);

	if (!isOpen) return null;

	// FUNCIÓN CLAVE: Normaliza el nombre para el check
	const isScript = (name) => {
		const n = name?.toLowerCase() || "";
		return n === 'javascript' || n === 'python';
	};

	const handleSelect = (policy) => {
		setSelectedType(policy);
		const acronym = getPolicyAcronym(policy.name);
		
		const scriptType = isScript(policy.name);
		const extension = policy.name.toLowerCase() === 'javascript' ? '.js' : '.py';

		setFormData({
			displayName: acronym, 
			name: acronym,
			scriptAction: scriptType && scripts.length > 0 ? 'existing' : 'new',
			scriptFile: scriptType && scripts.length > 0 ? scripts[0].name : `${acronym}${extension}`
		});
	};

	const isScriptPolicy = isScript(selectedType?.name);

	const filteredCatalog = Object.entries(catalog).reduce((acc, [category, policies]) => {
		const filtered = policies.filter(p =>
			p.name.toLowerCase().includes(searchTerm.toLowerCase())
		);
		if (filtered.length > 0) acc[category] = filtered;
		return acc;
	}, {});

	return (
		<div className={styles.overlay} onClick={onClose}>
			<div className={styles.modal} onClick={e => e.stopPropagation()}>
				<header className={styles.header}>
					<div className={styles.headerTitleGroup}>
						<h2>Add Policy</h2>
						<span className={styles.headerSubtitle}>Select a policy type from Django Local Catalog</span>
					</div>
					<button className={styles.closeButton} onClick={onClose}>
						<IconX size={18} strokeWidth={2.5} />
					</button>
				</header>

				<div className={styles.container}>
					<aside className={styles.sidebar}>
						<div className={styles.searchWrapper}>
							<div className={styles.searchIconPos}>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
									<circle cx="11" cy="11" r="8"></circle>
									<line x1="21" y1="21" x2="16.65" y2="16.65"></line>
								</svg>
							</div>
							<input
								placeholder="Search policies..."
								className={styles.searchInput}
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								autoFocus
							/>
						</div>

						<div className={styles.categoryList}>
							{loading ? (
								<div className={styles.placeholder} style={{ padding: '20px' }}>Loading catalog...</div>
							) : (
								Object.entries(filteredCatalog).map(([category, policies]) => (
									<div key={category}>
										<div className={styles.groupLabel}>{category}</div>
										{policies.map(p => (
											<div
												key={p.name}
												className={`${styles.policyItem} ${selectedType?.name === p.name ? styles.active : ''}`}
												onClick={() => handleSelect(p)}
											>
												<span className={styles.policyIconWrapper}>
													{p.type === 'AI' ? (
														<img src={AIIcon} className={styles.modalPolicyIcon} alt="AI" />
													) : p.type === 'Extension' ? (
														<img src={ExtensionIcon} className={styles.modalPolicyIcon} alt="Extension" />
													) : (
														getPolicyIcon(p.type, styles.modalPolicyIcon)
													)}
												</span>
												<span className={styles.policyNameText}>{p.name}</span>
											</div>
										))}
									</div>
								))
							)}
						</div>
					</aside>

					<main className={styles.formArea}>
						{selectedType ? (
							<div className={styles.formContainer}>
								<div className={styles.heroInfo}>
									<h3>{selectedType.name}</h3>
									<p>Category: {selectedType.type}</p>
								</div>
								
								<div className={styles.inputField}>
									<label>Display Name</label>
									<input
										value={formData.displayName}
										onChange={e => setFormData({ ...formData, displayName: e.target.value })}
									/>
								</div>
								
								<div className={styles.inputField}>
									<label>Name</label>
									<input
										value={formData.name}
										onChange={e => setFormData({ ...formData, name: e.target.value })}
									/>
								</div>

								{isScriptPolicy && (
									<div className={styles.scriptSection}>
										<div className={styles.inputField}>
											<label>Script File</label>
											<select 
												className={styles.select}
												value={formData.scriptAction === 'existing' ? formData.scriptFile : formData.scriptAction}
												onChange={(e) => {
													const val = e.target.value;
													if (val === 'new' || val === 'import') {
														const ext = selectedType.name.toLowerCase() === 'javascript' ? '.js' : '.py';
														setFormData({ 
															...formData, 
															scriptAction: val, 
															scriptFile: `${formData.name}${ext}` 
														});
													} else {
														setFormData({ ...formData, scriptAction: 'existing', scriptFile: val });
													}
												}}
											>
												{scripts.map(s => <option key={s.path} value={s.name}>{s.name}</option>)}
												<option value="new">Create new script</option>
												<option value="import">Import new script</option>
											</select>
										</div>

										{formData.scriptAction === 'import' && (
											<div className={styles.inputField}>
												<label>File Source</label>
												<div className={styles.filePickerRow}>
													<button 
														className={styles.btnSecondary}
														onClick={() => fileInputRef.current.click()}
													>
														{selectedImportedFile ? selectedImportedFile.name : 'Choose File'}
													</button>
													<input 
														type="file" 
														ref={fileInputRef} 
														style={{ display: 'none' }} 
														onChange={(e) => setSelectedImportedFile(e.target.files[0])}
													/>
												</div>
											</div>
										)}

										{(formData.scriptAction === 'new' || formData.scriptAction === 'import') && (
											<div className={styles.inputField}>
												<label>Script Name</label>
												<input
													value={formData.scriptFile}
													onChange={e => setFormData({ ...formData, scriptFile: e.target.value })}
												/>
											</div>
										)}
									</div>
								)}
							</div>
						) : (
							<div className={styles.placeholder}>
								<p>Select a policy type from the left panel to configure it.</p>
							</div>
						)}
					</main>
				</div>

				<footer className={styles.footer}>
					<button className={styles.btnCancel} onClick={onClose}>Cancel</button>
					<button
						className={styles.btnAdd}
						disabled={!selectedType || !formData.name.trim() || (formData.scriptAction === 'import' && !selectedImportedFile)}
						onClick={() => onAdd(selectedType, { ...formData, importedFile: selectedImportedFile })}
					>
						Add Policy
					</button>
				</footer>
			</div>
		</div>
	);
};